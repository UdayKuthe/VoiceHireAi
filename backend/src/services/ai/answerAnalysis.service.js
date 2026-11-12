/**
 * Answer Analysis Service (Phase 3 Brain)
 *
 * Implements spec §3.4, §3.5, §3.6, §10, §11:
 *  - Calls LLM with injection-guarded transcript
 *  - Extracts skills, evidence, uncertainty, missing, contradictions
 *  - Zod validation and retry/fallback
 *  - Redis state update mapping (§3.5) and evidence gap detection (§3.6)
 */

import crypto from 'crypto';
import { z } from 'zod';
import { executeChain } from './llmClient.js';
import { wrapCandidateTranscript, INJECTION_SYSTEM_DIRECTIVE } from './injectionGuard.js';
import { evaluateEvidenceStatus } from '../interviewEngine.service.js';

// ==============================================================================
// 1. Output Schema
// ==============================================================================

export const answerAnalysisOutputSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      demonstrated: z.boolean().default(false),
      depth: z.number().min(0).max(3).default(0)
    })
  ).default([]),
  evidence: z.array(
    z.object({
      skill: z.string().nullable().default(null),
      claimRef: z.string().nullable().default(null),
      type: z.enum(['ownership', 'technical_depth', 'tradeoff', 'metric', 'uncertainty', 'contradiction']).default('technical_depth'),
      snippet: z.string().max(200).default(''),
      strength: z.number().min(0).max(3).default(1)
    })
  ).default([]),
  uncertainty: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([])
});

// ==============================================================================
// 2. Deterministic Fallback Logic (§11)
// ==============================================================================

export function deterministicAnalysisFallback({
  transcript = '',
  relevantSkills = [],
  relevantClaims = [],
  groupFocusAreas = []
}) {
  const lower = transcript.toLowerCase();
  const detectedSkills = [];
  const detectedEvidence = [];
  const uncertainty = [];
  const missing = [];
  const contradictions = [];

  // Check for uncertainty keywords
  if (
    lower.includes("i don't know") ||
    lower.includes('not sure') ||
    lower.includes('cannot recall') ||
    lower.includes("haven't worked")
  ) {
    uncertainty.push('Candidate indicated uncertainty or lack of direct recall');
  }

  // Detect skills mentioned in transcript
  const allCandidateSkills = [...new Set([...relevantSkills, ...groupFocusAreas])];
  for (const sk of allCandidateSkills) {
    if (lower.includes(sk.toLowerCase())) {
      detectedSkills.push({
        name: sk,
        demonstrated: true,
        depth: 1
      });
      detectedEvidence.push({
        skill: sk,
        claimRef: null,
        type: 'technical_depth',
        snippet: transcript.slice(0, 180),
        strength: 1
      });
    }
  }

  // Detect claims mentioned
  for (const claim of relevantClaims) {
    const claimWords = (claim.text || '').toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matchesWord = claimWords.some((w) => lower.includes(w));
    if (matchesWord) {
      const hasDetailedOwnership =
        lower.includes('i designed') ||
        lower.includes('i architected') ||
        lower.includes('my responsibility') ||
        lower.includes('i implemented');

      detectedEvidence.push({
        skill: null,
        claimRef: claim.text,
        type: hasDetailedOwnership ? 'ownership' : 'technical_depth',
        snippet: transcript.slice(0, 180),
        strength: hasDetailedOwnership ? 2 : 1
      });

      if (!hasDetailedOwnership) {
        missing.push(`Exact technical ownership and implementation scope for "${claim.text}"`);
      }
    }
  }

  return {
    skills: detectedSkills,
    evidence: detectedEvidence,
    uncertainty,
    missing,
    contradictions
  };
}

// ==============================================================================
// 3. Main Analysis Function
// ==============================================================================

/**
 * Analyzes candidate spoken answer using LLM
 *
 * @param {Object} params
 * @param {string} params.question The question that was asked
 * @param {string} params.transcript Final speech transcript
 * @param {Array} [params.relevantClaims=[]] Claims relevant to current project/group
 * @param {Array} [params.relevantSkills=[]] Skills relevant to current project/group
 * @param {Array} [params.groupFocusAreas=[]] Focus areas of active group
 * @param {string} [params.currentProject=''] Active project name
 * @returns {Promise<Object>} Validated answer analysis output
 */
export async function analyzeAnswer({
  question = '',
  transcript = '',
  relevantClaims = [],
  relevantSkills = [],
  groupFocusAreas = [],
  currentProject = ''
}) {
  const guardedTranscript = wrapCandidateTranscript(transcript);

  const prompt = `
You are an expert technical interviewer evaluating a candidate's spoken response.
Analyze the candidate's answer strictly against the requested question and relevant claims/skills.

CONTEXT:
Active Project: ${currentProject || 'General / Background'}
Active Group Focus Areas: ${JSON.stringify(groupFocusAreas)}
Relevant Resume Claims: ${JSON.stringify(relevantClaims.map((c) => c.text || c))}
Relevant Skills: ${JSON.stringify(relevantSkills)}
Question Asked: "${question}"

CANDIDATE ANSWER (Untrusted audio transcript):
${guardedTranscript}

EVALUATION RUBRIC FOR EVIDENCE STRENGTH:
- 0: None
- 1: Shallow / superficial mention without technical specifics (a brief or unelaborated assertion MUST be strength 1 or 0)
- 2: Practical implementation details with concrete mechanisms
- 3: Deep architectural mastery with trade-offs

TASK:
1. Extract any technical skills demonstrated (depth 0=none, 1=surface/mention, 2=practical implementation, 3=architectural mastery).
2. Extract concrete evidence items. Type must be one of: "ownership", "technical_depth", "tradeoff", "metric", "uncertainty", "contradiction". Strength 0-3 according to the rubric above. Snippet max 200 chars.
3. If an answer claims something contradictory to a resume claim, flag in contradictions.
4. If an answer lacks concrete details (e.g. mentions integrating a technology without explaining their exact responsibility), list in missing.
5. If the candidate expresses vagueness or "I don't know", list in uncertainty.

Return strictly a JSON object conforming to:
{
  "skills": [{ "name": string, "demonstrated": boolean, "depth": number }],
  "evidence": [{ "skill": string|null, "claimRef": string|null, "type": string, "snippet": string, "strength": number }],
  "uncertainty": string[],
  "missing": string[],
  "contradictions": string[]
}
`.trim();

  const fallbackFn = () =>
    deterministicAnalysisFallback({
      transcript,
      relevantSkills,
      relevantClaims,
      groupFocusAreas
    });

  return executeChain({
    task: 'answer_analysis',
    prompt,
    systemInstruction: INJECTION_SYSTEM_DIRECTIVE,
    schema: answerAnalysisOutputSchema,
    fallbackFn,
    maxTokens: 1200
  });
}

// ==============================================================================
// 4. Redis State Update Mapping (§3.5) & Evidence Gap Detection (§3.6)
// ==============================================================================

/**
 * Applies analysis result directly to active Redis state object (mutating state under lock).
 *
 * @param {Object} state Active redis state
 * @param {Object} analysis Result of analyzeAnswer
 * @param {Object} context Metadata { questionId, answerId, project, group, transcript }
 */
export function applyAnalysisToState(state, analysis, context = {}) {
  const { questionId = '', answerId = '', project = '', group = '', transcript = '' } = context;
  const interviewState = state.interview_state;
  if (!interviewState) return state;

  const now = new Date().toISOString();
  const newEvidenceIds = [];

  // 1. Ingest Evidence
  for (const ev of analysis.evidence || []) {
    const evId = `ev_${crypto.randomUUID().slice(0, 8)}`;
    newEvidenceIds.push(evId);

    interviewState.evidence.push({
      id: evId,
      answerId: answerId || questionId,
      skill: ev.skill || null,
      claimRef: ev.claimRef || null,
      project: project || null,
      snippet: (ev.snippet || transcript).slice(0, 200),
      type: ev.type || 'technical_depth',
      strength: typeof ev.strength === 'number' ? ev.strength : 1
    });
  }

  // 2. Update Skills State
  for (const sk of analysis.skills || []) {
    const skillName = sk.name;
    const existingSkill = interviewState.skill_state[skillName] || {
      status: 'not_assessed',
      evidenceIds: [],
      lastUpdated: now
    };

    const relatedEv = interviewState.evidence.filter(
      (e) => e.skill && e.skill.toLowerCase() === skillName.toLowerCase()
    );

    const evaluatedStatus = evaluateEvidenceStatus({
      evidence: relatedEv,
      contradictions: analysis.contradictions,
      uncertainty: analysis.uncertainty
    });

    interviewState.skill_state[skillName] = {
      status: evaluatedStatus,
      evidenceIds: relatedEv.map((e) => e.id),
      lastUpdated: now
    };
  }

  // 3. Update Claim Verification & Gap Detection (§3.6)
  const candidateClaims = state.candidate_context?.claims || [];
  for (const claim of candidateClaims) {
    const claimText = claim.text;
    const relatedEv = interviewState.evidence.filter(
      (e) => e.claimRef && e.claimRef.toLowerCase() === claimText.toLowerCase()
    );

    if (relatedEv.length > 0 || analysis.missing?.some((m) => m.includes(claimText))) {
      const evaluatedStatus = evaluateEvidenceStatus({
        evidence: relatedEv,
        contradictions: analysis.contradictions,
        uncertainty: analysis.uncertainty
      });

      const existingClaim = interviewState.claim_verification[claimText] || {
        claimText,
        status: 'not_assessed',
        evidenceIds: [],
        notes: ''
      };

      existingClaim.status = evaluatedStatus;
      existingClaim.evidenceIds = relatedEv.map((e) => e.id);
      if (analysis.missing?.length > 0) {
        existingClaim.notes = analysis.missing.join('; ');
      }
      interviewState.claim_verification[claimText] = existingClaim;

      // Evidence Gap Detection (§3.6):
      // If claim is partially verified or has missing details, create an evidence gap
      if (evaluatedStatus === 'partially_verified' || evaluatedStatus === 'observed') {
        const existingGap = interviewState.evidence_gaps.find(
          (g) => !g.resolved && g.targetRef?.key === claimText
        );

        if (!existingGap) {
          const gapDescription =
            analysis.missing?.find((m) => m.includes(claimText)) ||
            `What was the candidate's exact implementation responsibility for "${claimText}"?`;

          interviewState.evidence_gaps.push({
            id: `gap_${crypto.randomUUID().slice(0, 8)}`,
            targetRef: { type: 'claim', key: claimText },
            description: gapDescription,
            raisedAtQuestionId: questionId,
            resolved: false,
            resolvedAtQuestionId: null
          });
        }
      } else if (evaluatedStatus === 'sufficiently_verified') {
        // Resolve any open gaps for this claim
        for (const g of interviewState.evidence_gaps) {
          if (!g.resolved && g.targetRef?.key === claimText) {
            g.resolved = true;
            g.resolvedAtQuestionId = questionId;
          }
        }
      }
    }
  }

  // 4. Update Answer History Status
  const currentAnswer = interviewState.answer_history.find((a) => a.questionId === questionId);
  if (currentAnswer) {
    currentAnswer.analysisStatus = 'done';
  }

  return state;
}

export default {
  answerAnalysisOutputSchema,
  deterministicAnalysisFallback,
  analyzeAnswer,
  applyAnalysisToState
};

