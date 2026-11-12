/**
 * Report Summary Service (Phase 3 Final Reporting)
 *
 * Implements spec §10 & §12:
 *  - Synthesizes factual executive summary of interview assessment
 *  - Output is summary text only (scoring & recommendations are NOT by LLM per PRD non-goals)
 *  - Deterministic fallback when LLM fails
 */

import { z } from 'zod';
import { executeChain } from './llmClient.js';

// ==============================================================================
// 1. Output Schema
// ==============================================================================

export const reportSummaryOutputSchema = z.object({
  candidateSummary: z.string().min(10),
  summaryText: z.string().min(20)
});

// ==============================================================================
// 2. Deterministic Fallback Summary
// ==============================================================================

export function generateDeterministicSummary(state = {}) {
  const candidateName = state.candidate_context?.name || 'The candidate';
  const jobTitle = state.job_context?.job_title || 'the target role';
  const skillState = state.interview_state?.skill_state || {};
  const claimVerification = state.interview_state?.claim_verification || {};
  const evidenceGaps = state.interview_state?.evidence_gaps || [];

  const verifiedSkills = Object.keys(skillState).filter(
    (k) => skillState[k]?.status === 'sufficiently_verified'
  );
  const partialSkills = Object.keys(skillState).filter(
    (k) => skillState[k]?.status === 'partially_verified'
  );
  const unverifiedSkills = Object.keys(skillState).filter(
    (k) => skillState[k]?.status === 'unverified'
  );

  const verifiedClaims = Object.keys(claimVerification).filter(
    (k) => claimVerification[k]?.status === 'sufficiently_verified'
  );
  const openGaps = evidenceGaps.filter((g) => !g.resolved);

  const candidateSummary = `${candidateName} participated in a technical assessment for ${jobTitle}, covering ${verifiedSkills.length} verified technical competencies and ${verifiedClaims.length} verified claims.`;

  const summaryText = [
    `Interview assessment for ${candidateName} for the position of ${jobTitle}.`,
    verifiedSkills.length > 0 ? `Verified technical skills: ${verifiedSkills.join(', ')}.` : 'No skills met sufficient verification threshold.',
    partialSkills.length > 0 ? `Partially demonstrated skills requiring further review: ${partialSkills.join(', ')}.` : '',
    unverifiedSkills.length > 0 ? `Unverified technical areas: ${unverifiedSkills.join(', ')}.` : '',
    verifiedClaims.length > 0 ? `Successfully verified project claims: ${verifiedClaims.length}.` : '',
    openGaps.length > 0 ? `Remaining evidence gaps: ${openGaps.map((g) => g.description).join('; ')}.` : 'All probed areas were addressed.'
  ]
    .filter(Boolean)
    .join(' ');

  return {
    candidateSummary,
    summaryText
  };
}

// ==============================================================================
// 3. Main Report Summary Generator
// ==============================================================================

/**
 * Generates factual assessment summary from completed active state
 *
 * @param {Object} state Active state matching redisActiveStateSchema
 * @returns {Promise<{ candidateSummary: string, summaryText: string }>}
 */
export async function generateReportSummary(state = {}) {
  const candidateContext = state.candidate_context || {};
  const jobContext = state.job_context || {};
  const interviewState = state.interview_state || {};

  const prompt = `
You are an expert technical evaluation synthesizer creating the final assessment executive summary.
Strict constraint: Provide objective factual summary text ONLY. Do NOT provide numeric rankings, hire/no-hire recommendations, or pass/fail decisions.

CANDIDATE INFO:
Name: ${candidateContext.name || 'Candidate'}
Experience Level: ${candidateContext.experience?.experienceLevel || 'N/A'} (${candidateContext.experience?.totalYears || 0} years)
Role Assessed: ${jobContext.job_title || 'Target Role'}

ASSESSMENT FINDINGS:
Assessed Skills State: ${JSON.stringify(interviewState.skill_state || {})}
Claim Verification: ${JSON.stringify(interviewState.claim_verification || {})}
Evidence Gaps: ${JSON.stringify((interviewState.evidence_gaps || []).map((g) => ({ desc: g.description, resolved: g.resolved })))}
Total Questions Answered: ${(interviewState.answer_history || []).length}

TASK:
Synthesize:
1. "candidateSummary": A concise 1-2 sentence overview of the candidate's technical profile and demonstrated background.
2. "summaryText": A detailed, structured factual summary paragraph highlighting verified technical depth, trade-offs discussed, and any open evidence gaps.

Return strictly a JSON object:
{
  "candidateSummary": string,
  "summaryText": string
}
`.trim();

  const fallbackFn = () => generateDeterministicSummary(state);

  return executeChain({
    task: 'report_summary',
    prompt,
    schema: reportSummaryOutputSchema,
    fallbackFn,
    maxTokens: 1000
  });
}

export default {
  reportSummaryOutputSchema,
  generateDeterministicSummary,
  generateReportSummary
};

