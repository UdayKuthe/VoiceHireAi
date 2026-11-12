/**
 * Finalize Interview Service (Phase 3 Stage C — S6)
 *
 * Implements spec §3.10 & §13:
 * 1. Idempotency guard (if already completed/partial, return existing report).
 * 2. Acquire Redis lock & set state to 'completing'.
 * 3. Drain pending analysis_queue.
 * 4. Compute final statuses & gather evidence snippets from turns.
 * 5. Build executive AssessmentReport summary via LLM chain (Groq 120B -> Gemini 3.5 -> deterministic).
 * 6. Write AssessmentReport & update Interview in MongoDB.
 * 7. Wipe Redis active state (1h TTL / destroy).
 * 8. Redis is never required after finalization.
 */

import { Interview } from '../models/Interview.js';
import { AssessmentReport } from '../models/AssessmentReport.js';
import { InterviewTurn } from '../models/InterviewTurn.js';
import { RedisStateManager } from './redisState.service.js';
import { generateReportSummary, generateDeterministicSummary } from './ai/reportSummary.service.js';
import { analyzeAnswer, applyAnalysisToState } from './ai/answerAnalysis.service.js';
import { disposeVoiceSession } from './voice/voiceSession.js';
import { computeRecommendation } from './evaluationRecommendation.service.js';

export async function finalizeInterview(interviewId, options = {}) {
  const {
    endedBy = 'system',
    isPartial = false,
    forceDeterministicSummary = false
  } = options;

  const idStr = interviewId.toString();

  // 1. Idempotency Guard: check if already finalized in MongoDB
  const interview = await Interview.findById(idStr);
  if (!interview) {
    throw new Error(`Interview not found: ${idStr}`);
  }

  const existingReport = await AssessmentReport.findOne({ interviewId: interview._id });
  if (['completed', 'partial'].includes(interview.status) && existingReport) {
    return {
      success: true,
      interview,
      report: existingReport,
      alreadyFinalized: true
    };
  }

  // 2. Load active Redis state (if exists) under lock
  let state = await RedisStateManager.get(idStr);

  if (state) {
    try {
      // Set completing status in Redis
      await RedisStateManager.patch(idStr, (s) => {
        s.interview_state.interview_status = 'completing';
        return s;
      });
      state = await RedisStateManager.get(idStr);
    } catch (_) {}
  }

  // 3. Drain analysis_queue if any items are pending
  if (state?.interview_state?.analysis_queue?.length > 0) {
    const queue = [...state.interview_state.analysis_queue];
    for (const item of queue) {
      try {
        const analysis = await analyzeAnswer({
          question: item.question,
          transcript: item.transcript,
          relevantClaims: state.candidate_context?.claims || [],
          relevantSkills: (state.candidate_context?.skills || []).map((s) => s.name || s),
          groupFocusAreas: item.focusAreas || [],
          currentProject: item.project
        });

        applyAnalysisToState(state, analysis, {
          questionId: item.questionId,
          answerId: item.answerId,
          project: item.project,
          group: item.group,
          transcript: item.transcript
        });
      } catch (err) {
        console.warn(`[Finalize] Failed to drain analysis queue item: ${err.message}`);
      }
    }
    state.interview_state.analysis_queue = [];
  }

  // 4. Fetch all persisted turns from MongoDB for evidence collection
  const turns = await InterviewTurn.find({ interviewId: interview._id }).sort({ seq: 1 });

  // 5. Gather evidence snippets & map skillsAssessed
  const skillState = state?.interview_state?.skill_state || {};
  const claimVerification = state?.interview_state?.claim_verification || {};
  const evidenceGaps = state?.interview_state?.evidence_gaps || [];

  // Index snippets from turns
  const snippetsBySkill = new Map();
  for (const turn of turns) {
    if (Array.isArray(turn.evidence)) {
      for (const ev of turn.evidence) {
        if (ev.skill && ev.snippet) {
          const list = snippetsBySkill.get(ev.skill) || [];
          if (!list.includes(ev.snippet)) {
            list.push(ev.snippet);
          }
          snippetsBySkill.set(ev.skill, list);
        }
      }
    }
  }

  const skillsAssessed = Object.keys(skillState).map((skillName) => {
    const entry = skillState[skillName];
    const snippets = snippetsBySkill.get(skillName) || [];
    return {
      name: skillName,
      status: entry.status || 'not_assessed',
      evidenceCount: (entry.evidenceIds || []).length || snippets.length,
      snippets
    };
  });

  // Map project claims
  const claims = (state?.candidate_context?.claims || []).map((c, idx) => {
    const text = typeof c === 'string' ? c : c.text;
    const project = typeof c === 'object' ? c.relatedProject || '' : '';
    const claimKey = `claim_${idx + 1}`;
    const verifiedEntry = claimVerification[claimKey] || claimVerification[text] || {};
    return {
      text,
      project,
      status: verifiedEntry.status || 'not_assessed',
      notes: verifiedEntry.notes || ''
    };
  });

  // Map remaining gaps
  const remainingGaps = evidenceGaps
    .filter((g) => !g.resolved)
    .map((g) => ({
      targetRef: g.targetRef || { type: 'topic', key: g.description },
      description: g.description
    }));

  // Build question-answer history
  const questionAnswerHistory = turns.map((t) => ({
    seq: t.seq,
    question: t.question?.text || '',
    answer: t.answer?.transcript || '',
    kind: t.question?.kind || 'main',
    group: t.question?.group || '',
    project: t.question?.project || null,
    durationMs: t.answer?.durationMs || 0
  }));

  // Calculate coverage
  const visitedSections = new Set(turns.map((t) => t.question?.section).filter(Boolean));
  const visitedGroups = new Set(
    turns.map((t) => `${t.question?.section || 0}-${t.question?.group || ''}`).filter(Boolean)
  );
  const coverage = {
    sectionsDone: visitedSections.size,
    groupsDone: visitedGroups.size
  };

  const startedAt = state?.interview_state?.progress?.startedAt
    ? new Date(state.interview_state.progress.startedAt).getTime()
    : interview.live?.startedAt ? new Date(interview.live.startedAt).getTime() : Date.now();
  const durationMs = state?.interview_state?.progress?.elapsedMs || Math.max(0, Date.now() - startedAt);

  // Determine final partial status
  const determinedPartial =
    isPartial ||
    (state?.assessment_plan?.sections && coverage.sectionsDone < state.assessment_plan.sections.length);
  const finalStatus = determinedPartial ? 'partial' : 'completed';

  // 6. Generate Assessment Summary (Groq 120B -> Gemini 3.5 -> Deterministic)
  let summary = { candidateSummary: '', summaryText: '' };
  if (state) {
    if (forceDeterministicSummary) {
      summary = generateDeterministicSummary(state);
    } else {
      try {
        summary = await generateReportSummary(state);
      } catch (err) {
        console.warn(`[Finalize] LLM summary failed, using deterministic fallback: ${err.message}`);
        summary = generateDeterministicSummary(state);
      }
    }
  }

  // 7. Compute Objective Recommendation
  const recommendation = computeRecommendation({
    skillsAssessed,
    claims,
    remainingGaps,
    questionAnswerHistory,
    coverage,
    durationMs,
    partial: determinedPartial
  });

  // 8. Write AssessmentReport in MongoDB
  const report = await AssessmentReport.findOneAndUpdate(
    { interviewId: interview._id },
    {
      interviewId: interview._id,
      candidateId: interview.candidateId,
      candidateSummary: summary.candidateSummary,
      summaryText: summary.summaryText,
      skillsAssessed,
      claims,
      remainingGaps,
      questionAnswerHistory,
      coverage,
      durationMs,
      endedBy,
      partial: determinedPartial,
      recommendation,
      generatedAt: new Date(),
      status: 'completed'
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  // 9. Update Interview in MongoDB
  interview.status = finalStatus;
  interview.live = interview.live || {};
  interview.live.endedAt = new Date();
  interview.live.endedBy = endedBy;
  await interview.save();

  // 9. Wipe Redis active state (immediate deletion; Redis never required after finalization)
  try {
    await RedisStateManager.destroy(idStr, 0);
  } catch (err) {
    console.warn(`[Finalize] Redis destroy warning: ${err.message}`);
  }

  // 10. Dispose active voice bot session (§13 step 7)
  try {
    disposeVoiceSession(idStr);
  } catch (_) {}

  return {
    success: true,
    interview,
    report,
    alreadyFinalized: false
  };
}

export default finalizeInterview;
