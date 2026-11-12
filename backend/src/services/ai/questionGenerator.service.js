/**
 * Question Generator Service (Phase 3 Brain)
 *
 * Implements spec §4, §10 & §11:
 *  - Batched pre-generation of main questions at /start (up to 2 sections per batch, <5K tokens)
 *  - Probe question generator (live on probe turns only)
 *  - Speakable questions (≤40 words, single question, no lists)
 *  - Level calibration & difficulty
 *  - Jaccard duplicate check (>0.8): regenerates once, else deterministic template
 *  - Deterministic template fallback when LLM fails or duplicate persists
 */

import { z } from 'zod';
import { executeChain } from './llmClient.js';
import { checkDuplicateQuestion } from './jaccard.js';

// ==============================================================================
// 1. Output Schemas
// ==============================================================================

export const targetRefSchema = z.object({
  type: z.enum(['skill', 'claim', 'requirement', 'topic']).default('topic'),
  key: z.string().default('')
});

export const questionGeneratorOutputSchema = z.object({
  text: z.string().min(5).max(300),
  kind: z.enum(['main', 'probe', 'clarify', 'reprompt']).default('main'),
  targetRef: targetRefSchema.optional(),
  rationale: z.string().default('')
});

export const pregenBatchOutputSchema = z.object({
  questions: z.array(
    z.object({
      sectionIdx: z.number(),
      groupIdx: z.number(),
      text: z.string(),
      targetRef: targetRefSchema.optional()
    })
  )
});

// ==============================================================================
// 2. Word Count Normalizer
// ==============================================================================

export function enforceWordLimit(text, limit = 40) {
  if (!text || typeof text !== 'string') return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) {
    const trimmed = text.trim();
    return trimmed.endsWith('?') ? trimmed : trimmed + '?';
  }
  return words.slice(0, limit).join(' ') + '?';
}

// ==============================================================================
// 3. Deterministic Fallback Templates (§11)
// ==============================================================================

export function generateTemplateQuestion({
  targetRef = null,
  group = null,
  focusAreas = [],
  currentProject = '',
  kind = 'main',
  forbiddenRepeatList = []
}) {
  const targetKey = targetRef?.key || focusAreas[0] || group?.name || 'this area';

  const candidates = [
    `Can you walk me through your technical implementation of ${targetKey} in ${currentProject || 'your recent work'}?`,
    `What were the major technical trade-offs you encountered when designing ${targetKey}?`,
    `How did you handle error recovery and edge cases with ${targetKey}?`,
    `Could you detail your exact personal responsibilities regarding ${targetKey}?`,
    `How did the architecture of ${targetKey} support scalability and performance?`
  ];

  for (const candidate of candidates) {
    const dupCheck = checkDuplicateQuestion(candidate, forbiddenRepeatList, 0.7);
    if (!dupCheck.isDuplicate) {
      return {
        text: candidate,
        kind: kind || 'main',
        targetRef: targetRef || { type: 'topic', key: targetKey },
        rationale: 'Deterministic fallback question selected to avoid duplicate question history.'
      };
    }
  }

  return {
    text: `Could you share more technical details about how you implemented ${targetKey}?`,
    kind: kind || 'main',
    targetRef: targetRef || { type: 'topic', key: targetKey },
    rationale: 'Default deterministic template fallback.'
  };
}

// ==========================================
// 4. Batched Pre-generation (§11-A)
// ==========================================

/**
 * Pre-generates questions for a slice of sections (at most 2 sections per call)
 */
export async function pregenQuestionsBatch({
  sections = [],
  sectionOffset = 0,
  candidateContext = {},
  jobContext = {},
  difficulty = 'medium',
  level = 'mid',
  existingBank = {}
}) {
  const batchTargets = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const globalSectionIdx = sectionOffset + sIdx;
    const sec = sections[sIdx];
    const groups = sec.groups || [];

    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const bankKey = `${globalSectionIdx}-${gIdx}`;
      if (existingBank[bankKey]) continue; // Idempotent: skip existing

      const group = groups[gIdx];
      batchTargets.push({
        sectionIdx: globalSectionIdx,
        groupIdx: gIdx,
        sectionName: sec.name,
        sectionType: sec.type,
        groupName: group.name,
        focusAreas: group.focusAreas || [],
        baseDifficulty: group.baseDifficulty || difficulty
      });
    }
  }

  if (batchTargets.length === 0) {
    return [];
  }

  const prompt = `You are an expert technical interviewer pre-generating main interview questions in JSON format.
Candidate Level: "${level}", Target Difficulty: "${difficulty}"
Job Title: "${jobContext.job_title || 'Software Engineer'}"
Candidate Projects Summary: ${JSON.stringify(
    (candidateContext.projects || []).map((p) => ({ name: p.name, tech: p.technologies }))
  )}

Generate exactly ONE main interview question for each requested section and group:
${JSON.stringify(batchTargets, null, 2)}

CONSTRAINTS (STRICT):
1. Exactly ONE speakable question per target.
2. Max 40 words per question. Conversational, technical, clear for spoken audio.
3. No bullet points, no lists, no multiple sub-questions. Must end with "?".

Return a single JSON object strictly matching this schema:
{
  "questions": [
    {
      "sectionIdx": number,
      "groupIdx": number,
      "text": string,
      "targetRef": { "type": "skill" | "claim" | "requirement" | "topic", "key": string }
    }
  ]
}`;

  const fallbackFn = () => ({
    questions: batchTargets.map((t) => {
      const template = generateTemplateQuestion({
        targetRef: { type: 'topic', key: t.focusAreas[0] || t.groupName },
        group: { name: t.groupName },
        focusAreas: t.focusAreas,
        currentProject: t.sectionName
      });
      return {
        sectionIdx: t.sectionIdx,
        groupIdx: t.groupIdx,
        text: template.text,
        targetRef: template.targetRef
      };
    })
  });

  try {
    const result = await executeChain({
      task: 'question_pregen',
      prompt,
      schema: pregenBatchOutputSchema,
      fallbackFn,
      temperature: 0.3,
      maxTokens: 1400
    });

    return (result.questions || []).map((q) => ({
      ...q,
      text: enforceWordLimit(q.text, 40)
    }));
  } catch (err) {
    console.warn('[questionGenerator] pregen batch failed, using template fallback:', err.message);
    return fallbackFn().questions;
  }
}

/**
 * Orchestrates pre-generation of all sections across the assessment plan in batches.
 * First batch is awaited; remaining batches run with >=10s spacing.
 *
 * @param {Object} params
 * @param {Object} params.assessmentPlan
 * @param {Object} params.candidateContext
 * @param {Object} params.jobContext
 * @param {Object} [params.existingBank={}]
 * @param {Function} [params.onBatchComplete] Callback invoked when a batch finishes: fn(batchResults, isFirstBatch)
 * @returns {Promise<Object>} Full question_bank map
 */
export async function batchPregenPlan({
  assessmentPlan = {},
  candidateContext = {},
  jobContext = {},
  existingBank = {},
  onBatchComplete = null
}) {
  const sections = assessmentPlan.sections || [];
  const level = assessmentPlan.experienceLevel || candidateContext.experience?.experienceLevel || 'mid';
  const questionBank = { ...existingBank };

  // Split into batches of at most 2 sections per batch (§11-A)
  const batches = [];
  for (let i = 0; i < sections.length; i += 2) {
    batches.push({
      sections: sections.slice(i, i + 2),
      sectionOffset: i
    });
  }

  if (batches.length === 0) {
    return questionBank;
  }

  // 1. Process FIRST batch immediately (awaited before first question per §11-A)
  const firstBatch = batches[0];
  const firstResults = await pregenQuestionsBatch({
    sections: firstBatch.sections,
    sectionOffset: firstBatch.sectionOffset,
    candidateContext,
    jobContext,
    level,
    existingBank: questionBank
  });

  for (const q of firstResults) {
    const key = `${q.sectionIdx}-${q.groupIdx}`;
    questionBank[key] = {
      text: q.text,
      targetRef: q.targetRef || { type: 'topic', key: '' },
      source: 'llm'
    };
  }

  // Fill templates for any missing groups in first batch
  for (let sIdx = 0; sIdx < firstBatch.sections.length; sIdx++) {
    const globalSectionIdx = firstBatch.sectionOffset + sIdx;
    const sec = firstBatch.sections[sIdx];
    for (let gIdx = 0; gIdx < (sec.groups || []).length; gIdx++) {
      const key = `${globalSectionIdx}-${gIdx}`;
      if (!questionBank[key]) {
        const tpl = generateTemplateQuestion({
          targetRef: { type: 'topic', key: sec.groups[gIdx]?.name || '' },
          group: sec.groups[gIdx],
          focusAreas: sec.groups[gIdx]?.focusAreas,
          currentProject: sec.name
        });
        questionBank[key] = { text: tpl.text, targetRef: tpl.targetRef, source: 'template' };
      }
    }
  }

  if (typeof onBatchComplete === 'function') {
    onBatchComplete({ ...questionBank }, true);
  }

  // 2. Remaining batches in background or sequentially spaced ≥10 s apart (TPM guard §4.5)
  const processRemaining = async () => {
    for (let bIdx = 1; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      // TPM guard: space background batches at least 10 s apart
      await new Promise((resolve) => setTimeout(resolve, 10000));

      try {
        const results = await pregenQuestionsBatch({
          sections: batch.sections,
          sectionOffset: batch.sectionOffset,
          candidateContext,
          jobContext,
          level,
          existingBank: questionBank
        });

        for (const q of results) {
          const key = `${q.sectionIdx}-${q.groupIdx}`;
          questionBank[key] = {
            text: q.text,
            targetRef: q.targetRef || { type: 'topic', key: '' },
            source: 'llm'
          };
        }

        // Fill templates for any groups without question
        for (let sIdx = 0; sIdx < batch.sections.length; sIdx++) {
          const globalSectionIdx = batch.sectionOffset + sIdx;
          const sec = batch.sections[sIdx];
          for (let gIdx = 0; gIdx < (sec.groups || []).length; gIdx++) {
            const key = `${globalSectionIdx}-${gIdx}`;
            if (!questionBank[key]) {
              const tpl = generateTemplateQuestion({
                targetRef: { type: 'topic', key: sec.groups[gIdx]?.name || '' },
                group: sec.groups[gIdx],
                focusAreas: sec.groups[gIdx]?.focusAreas,
                currentProject: sec.name
              });
              questionBank[key] = { text: tpl.text, targetRef: tpl.targetRef, source: 'template' };
            }
          }
        }

        if (typeof onBatchComplete === 'function') {
          onBatchComplete({ ...questionBank }, false);
        }
      } catch (err) {
        console.warn(`[questionGenerator] Background pregen batch ${bIdx} failed:`, err.message);
      }
    }
  };

  // If there are background batches, let them run or return promise
  if (batches.length > 1) {
    processRemaining().catch((err) => console.error('[questionGenerator] Background pregen error:', err));
  }

  return questionBank;
}

// ==========================================
// 5. Probe Question Generator (§11-C)
// ==========================================

/**
 * Generates targeted follow-up probe question live during interview
 */
export async function generateProbeQuestion({
  targetRef = null,
  group = null,
  focusAreas = [],
  difficulty = 'medium',
  level = 'mid',
  last3QA = [],
  openGaps = [],
  forbiddenRepeatList = [],
  currentProject = ''
}) {
  const buildPrompt = (retryNote = '') => `You are an expert AI technical interviewer generating one live follow-up probe question in JSON format.
Target: ${JSON.stringify(targetRef)}
Project: "${currentProject || 'General'}"
Group: "${group?.name || 'Technical Discussion'}"
Focus Areas: ${JSON.stringify(focusAreas)}
Level: "${level}", Difficulty: "${difficulty}"
Open Gaps: ${JSON.stringify(openGaps.slice(0, 2).map((g) => g.description))}
Recent Context: ${JSON.stringify(last3QA.slice(-2))}
Previous Questions (DO NOT REPEAT): ${JSON.stringify(forbiddenRepeatList.slice(-6))}
${retryNote}

CONSTRAINTS (STRICT):
1. Exactly ONE question ending with "?".
2. Under 40 words. Speakable, natural audio phrasing.
3. No bullet points, no multiple questions.

Return a single JSON object strictly matching this schema:
{
  "text": "Your follow-up question?",
  "kind": "probe",
  "targetRef": { "type": "skill" | "claim" | "requirement" | "topic", "key": string },
  "rationale": "Brief reason for this probe"
}`;

  const fallbackFn = () =>
    generateTemplateQuestion({
      targetRef,
      group,
      focusAreas,
      currentProject,
      kind: 'probe',
      forbiddenRepeatList
    });

  let result;
  try {
    result = await executeChain({
      task: 'probe_generator',
      prompt: buildPrompt(),
      schema: questionGeneratorOutputSchema,
      fallbackFn,
      temperature: 0.3,
      maxTokens: 600
    });
  } catch (err) {
    console.warn('[questionGenerator] Probe generation failed, using template:', err.message);
    return fallbackFn();
  }

  // Jaccard Duplicate Check (>0.8 threshold §11-C)
  let dupCheck = checkDuplicateQuestion(result.text, forbiddenRepeatList, 0.8);
  if (dupCheck.isDuplicate) {
    console.warn(
      `[questionGenerator] Duplicate probe detected (${dupCheck.maxSimilarity.toFixed(2)} vs "${dupCheck.matchingText}"). Regenerating once...`
    );

    const retryNote = `CRITICAL: Previous question "${result.text}" was too similar to previously asked questions. Generate an entirely different question targeting ${targetRef?.key || focusAreas[0]}.`;

    try {
      result = await executeChain({
        task: 'probe_generator',
        prompt: buildPrompt(retryNote),
        schema: questionGeneratorOutputSchema,
        fallbackFn,
        temperature: 0.5,
        maxTokens: 600
      });
      dupCheck = checkDuplicateQuestion(result.text, forbiddenRepeatList, 0.8);
    } catch {
      return fallbackFn();
    }

    if (dupCheck.isDuplicate) {
      console.warn('[questionGenerator] Duplicate persists after regeneration. Using template fallback.');
      return fallbackFn();
    }
  }

  result.text = enforceWordLimit(result.text, 40);
  result.kind = 'probe';
  if (!result.targetRef && targetRef) {
    result.targetRef = targetRef;
  }

  return result;
}

/**
 * Backward compatibility wrapper
 */
export async function generateNextQuestion(params) {
  if (params.kind === 'probe') {
    return generateProbeQuestion(params);
  }
  return generateTemplateQuestion(params);
}

export default {
  questionGeneratorOutputSchema,
  pregenBatchOutputSchema,
  enforceWordLimit,
  generateTemplateQuestion,
  pregenQuestionsBatch,
  batchPregenPlan,
  generateProbeQuestion,
  generateNextQuestion
};
