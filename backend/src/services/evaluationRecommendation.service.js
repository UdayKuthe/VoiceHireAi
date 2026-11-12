/**
 * Evaluation Recommendation Service
 *
 * Computes objective hiring recommendations and competency scores
 * based on the final interview assessment report data.
 */

export function computeRecommendation(report = {}) {
  const skillsAssessed = report.skillsAssessed || [];
  const claims = report.claims || [];
  const remainingGaps = report.remainingGaps || [];
  const history = report.questionAnswerHistory || [];
  const coverage = report.coverage || { sectionsDone: 0, groupsDone: 0 };
  const durationMs = report.durationMs || 0;

  // 1. Skill Verification Metrics
  const totalSkills = skillsAssessed.length;
  const verifiedSkills = skillsAssessed.filter(
    (s) => s.status === 'sufficiently_verified'
  );
  const partiallyVerifiedSkills = skillsAssessed.filter(
    (s) => s.status === 'partially_verified' || s.status === 'observed'
  );
  const unverifiedSkills = skillsAssessed.filter(
    (s) => s.status === 'unverified' || s.status === 'contradictory'
  );
  const notAssessedSkills = skillsAssessed.filter(
    (s) => !s.status || s.status === 'not_assessed'
  );

  // 2. Project Claim Metrics
  const totalClaims = claims.length;
  const verifiedClaims = claims.filter(
    (c) => c.status === 'sufficiently_verified'
  );
  const unverifiedClaims = claims.filter(
    (c) => c.status === 'unverified' || c.status === 'contradictory'
  );

  // 3. Score Calculation (Weighted)
  // Skill verification weight: 60%
  let skillScore = 0;
  if (totalSkills > 0) {
    const rawSkillPoints =
      verifiedSkills.length * 1.0 + partiallyVerifiedSkills.length * 0.5;
    skillScore = Math.min(100, Math.round((rawSkillPoints / totalSkills) * 100));
  } else {
    skillScore = 70; // Baseline if no explicit skill list
  }

  // Claim verification weight: 25%
  let claimScore = 100;
  if (totalClaims > 0) {
    claimScore = Math.min(100, Math.round((verifiedClaims.length / totalClaims) * 100));
  }

  // Coverage & dialogue completion weight: 15%
  const coverageScore = report.partial ? 50 : 100;

  // Composite Score (0 - 100)
  const compositeScore = Math.round(
    skillScore * 0.6 + claimScore * 0.25 + coverageScore * 0.15
  );

  // 4. Decision & Category
  let decision = 'consider';
  let label = 'Consider with Follow-up';
  let color = 'amber';
  let summary = '';

  if (compositeScore >= 80) {
    decision = 'strong_hire';
    label = 'Strong Hire';
    color = 'emerald';
    summary = `Candidate demonstrated verified technical depth across ${verifiedSkills.length} core competencies with concrete evidence. High alignment with role requirements.`;
  } else if (compositeScore >= 68) {
    decision = 'hire';
    label = 'Hire';
    color = 'blue';
    summary = `Candidate verified key foundational competencies required for the position. Minor evidence gaps can be supported through normal team onboarding.`;
  } else if (compositeScore >= 50) {
    decision = 'lean_hire';
    label = 'Lean Hire / Consider';
    color = 'amber';
    summary = `Candidate demonstrated moderate competency with notable gaps in verification. Recommend conducting a targeted technical follow-up session.`;
  } else {
    decision = 'do_not_hire';
    label = 'Do Not Hire';
    color = 'rose';
    summary = `Significant evidence gaps across essential competencies and project claims. Candidate did not reach required verification thresholds.`;
  }

  // 5. Strengths (top verified skills and claims)
  const strengths = [];
  if (verifiedSkills.length > 0) {
    strengths.push(
      `Strongly verified technical competencies: ${verifiedSkills.map((s) => s.name).slice(0, 5).join(', ')}`
    );
  }
  if (verifiedClaims.length > 0) {
    strengths.push(
      `Validated ${verifiedClaims.length} key project claims with supporting technical details.`
    );
  }
  if (history.length >= 5) {
    strengths.push(`Completed extensive technical dialogue across ${history.length} probed questions.`);
  }
  if (strengths.length === 0) {
    strengths.push('Engaged in technical dialogue across foundational topics.');
  }

  // 6. Concerns & Open Gaps
  const concerns = [];
  if (unverifiedSkills.length > 0) {
    concerns.push(
      `Unverified competencies: ${unverifiedSkills.map((s) => s.name).slice(0, 4).join(', ')}`
    );
  }
  if (remainingGaps.length > 0) {
    concerns.push(
      `${remainingGaps.length} unresolved evidence gaps flagged during interview.`
    );
  }
  if (unverifiedClaims.length > 0) {
    concerns.push(
      `Project claims lacking depth: ${unverifiedClaims.map((c) => c.text).slice(0, 2).join('; ')}`
    );
  }
  if (report.partial) {
    concerns.push('Interview concluded early before completing all planned sections.');
  }
  if (concerns.length === 0) {
    concerns.push('No critical evidence gaps or contradictory statements identified.');
  }

  // 7. Suggested Next Steps for Recruiter
  const suggestedNextSteps = [];
  if (decision === 'strong_hire' || decision === 'hire') {
    suggestedNextSteps.push('Advance candidate to final team culture & leadership alignment round.');
    suggestedNextSteps.push('Conduct standard compensation and offer preparation.');
  } else if (decision === 'lean_hire') {
    if (unverifiedSkills.length > 0) {
      suggestedNextSteps.push(
        `Conduct a 30-minute targeted technical probe on: ${unverifiedSkills.map((s) => s.name).slice(0, 3).join(', ')}.`
      );
    }
    suggestedNextSteps.push('Review candidate code samples or architecture portfolio.');
  } else {
    suggestedNextSteps.push('Send professional rejection email with constructive feedback.');
    suggestedNextSteps.push('Retain profile in talent pool for roles matching junior technical profile.');
  }

  // Duration formatted helper
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  const durationFormatted = `${minutes}m ${seconds}s`;

  return {
    decision,
    label,
    color,
    score: compositeScore,
    skillScore,
    claimScore,
    summary,
    strengths,
    concerns,
    suggestedNextSteps,
    metrics: {
      verifiedSkillsCount: verifiedSkills.length,
      partiallyVerifiedSkillsCount: partiallyVerifiedSkills.length,
      unverifiedSkillsCount: unverifiedSkills.length,
      notAssessedSkillsCount: notAssessedSkills.length,
      totalSkillsCount: totalSkills,
      verifiedClaimsCount: verifiedClaims.length,
      totalClaimsCount: totalClaims,
      evidenceGapsCount: remainingGaps.length,
      questionsAnsweredCount: history.length,
      sectionsCompleted: coverage.sectionsDone || 0,
      durationMs,
      durationFormatted,
      isPartial: Boolean(report.partial)
    }
  };
}
