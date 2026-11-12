/**
 * Interview Engine Service (Phase 3 Core Progression & State Machine)
 *
 * Implements deterministic live interview progression rules (spec §3.7, §9):
 *  - Order: intro → projects (high → medium → low) → requirements → wrapup
 *  - Per project: groups 1 → 2 → 3 (Architecture & Design → Implementation & Technical Trade-offs → Edge Cases & Operational Lessons)
 *  - Group advance: (questionsInGroup >= 1 && all targets verified/unverified) || probesUsed >= 2 || sectionTime > 150% || soft/hard end
 *  - Probe priority: contradictory > partially_verified claim in current project > open EG in current group > focusArea skill not_assessed
 *  - Skip logic: skip group if all focusAreas sufficiently_verified (FR-17); skip LOW projects if remaining time < 4 min
 *  - Difficulty calibration: group baseDifficulty + candidate experience level calibration (never recomputed)
 *  - Status rules: deterministic status transitions from evidence & answers
 */

import { normalizePriority } from '../schemas/redis.schema.js';

// ==============================================================================
// 1. Constants & Calibration Definitions
// ==============================================================================

export const MANDATORY_PROJECT_GROUPS = [
  'Architecture & Design',
  'Implementation & Technical Trade-offs',
  'Edge Cases & Operational Lessons'
];

export const LEVEL_CALIBRATION_GUIDELINES = {
  fresher: {
    level: 'fresher',
    experienceRange: '<1 yr',
    guideline: 'Foundational concepts, basic component design, syntax/API usage, guided scenarios.',
    focusAreaModifier: 'foundational'
  },
  junior: {
    level: 'junior',
    experienceRange: '1–<3 yrs',
    guideline: 'Standard design patterns, direct implementation trade-offs, debugging practical bugs.',
    focusAreaModifier: 'practical_implementation'
  },
  mid: {
    level: 'mid',
    experienceRange: '3–<6 yrs',
    guideline: 'System architecture, scalability decisions, concurrency, edge-case mitigation.',
    focusAreaModifier: 'architecture_concurrency'
  },
  senior: {
    level: 'senior',
    experienceRange: '6+ yrs',
    guideline: 'Large-scale distributed architecture, complex failure domains, cross-cutting concerns, tech strategy.',
    focusAreaModifier: 'distributed_strategy'
  }
};

export const PRIORITY_WEIGHTS = {
  high: 1,
  medium: 2,
  low: 3
};

// ==============================================================================
// 2. Ordering & Structure Helpers
// ==============================================================================

/**
 * Returns sections in strict execution order:
 * Intro → Projects (strictly HIGH → MEDIUM → LOW priority) → Requirements
 */
export function getOrderedSections(assessmentPlan) {
  const sections = assessmentPlan?.sections || [];
  if (!Array.isArray(sections) || sections.length === 0) return [];

  const intro = sections.filter((s) => s.type === 'intro');
  const projects = sections
    .filter((s) => s.type === 'project')
    .sort((a, b) => {
      const pA = PRIORITY_WEIGHTS[normalizePriority(a.priority)] || 4;
      const pB = PRIORITY_WEIGHTS[normalizePriority(b.priority)] || 4;
      if (pA !== pB) return pA - pB;
      return (a.order || 0) - (b.order || 0);
    });
  const requirements = sections.filter((s) => s.type === 'requirements');

  return [...intro, ...projects, ...requirements];
}

/**
 * Calculates interview time caps based on section durationMinutes (D5)
 */
export function calculateTimeCaps(assessmentPlan) {
  const sections = assessmentPlan?.sections || [];
  const softEndMinutes = sections.reduce((acc, s) => acc + (s.durationMinutes || 10), 0);
  const softEndMs = softEndMinutes * 60 * 1000;
  const hardCapMs = (softEndMinutes + 10) * 60 * 1000;
  return { softEndMinutes, softEndMs, hardCapMs };
}

/**
 * Calibrates difficulty from group baseDifficulty + candidate experience level
 */
export function calibrateDifficulty(baseDifficulty = 'medium', experienceLevel = 'mid') {
  const normLevel = (experienceLevel || 'mid').toLowerCase().trim();
  const calibration = LEVEL_CALIBRATION_GUIDELINES[normLevel] || LEVEL_CALIBRATION_GUIDELINES.mid;
  const validBase = ['easy', 'medium', 'hard'].includes(baseDifficulty?.toLowerCase())
    ? baseDifficulty.toLowerCase()
    : 'medium';

  return {
    baseDifficulty: validBase,
    experienceLevel: calibration.level,
    calibratedDifficulty: `${calibration.level}_${validBase}`,
    guideline: calibration.guideline,
    focusAreaModifier: calibration.focusAreaModifier
  };
}

// ==============================================================================
// 3. Skip & Advance Rules
// ==============================================================================

/**
 * Checks if a group should be skipped because all focusAreas are already sufficiently verified (FR-17)
 */
export function shouldSkipGroup(group, skillState = {}, claimVerification = {}) {
  const focusAreas = group?.focusAreas || [];
  if (!Array.isArray(focusAreas) || focusAreas.length === 0) return false;

  return focusAreas.every((fa) => {
    const norm = fa.toLowerCase().trim();

    // Check skill state
    const skillKey = Object.keys(skillState).find((k) => k.toLowerCase().trim() === norm);
    const skillStatus = skillKey ? skillState[skillKey]?.status : null;
    if (skillStatus === 'sufficiently_verified') return true;

    // Check claim verification
    const claimKey = Object.keys(claimVerification).find((k) => k.toLowerCase().includes(norm));
    const claimStatus = claimKey ? claimVerification[claimKey]?.status : null;
    return claimStatus === 'sufficiently_verified';
  });
}

/**
 * Checks if a LOW priority project should be skipped when remaining time < 4 min
 */
export function shouldSkipLowProject(section, remainingMs) {
  if (section?.type !== 'project') return false;
  const isLow = normalizePriority(section?.priority) === 'low';
  return isLow && remainingMs < 4 * 60 * 1000;
}

/**
 * Evaluates whether current group advance condition is met (spec §9):
 * 1. questionsInGroup >= 1 && all group focus targets in {sufficiently_verified, unverified}
 * 2. probesUsed >= 2 (probe cap)
 * 3. section time > 150% of durationMinutes
 * 4. soft end reached (jump to requirements or wrapup)
 * 5. hard cap reached (wrapup immediately)
 */
export function checkGroupAdvanceCondition({
  questionsInGroup = 0,
  probesUsed = 0,
  group = null,
  section = null,
  sectionElapsedMs = 0,
  totalElapsedMs = 0,
  softEndMs = 0,
  hardCapMs = 0,
  skillState = {},
  claimVerification = {},
  isLastSection = false,
  isRequirementsSection = false
}) {
  // Hard end reached
  if (hardCapMs > 0 && totalElapsedMs >= hardCapMs) {
    return {
      shouldAdvance: true,
      reason: 'hard_cap_reached',
      forceWrapup: true
    };
  }

  // Soft end reached
  if (softEndMs > 0 && totalElapsedMs >= softEndMs) {
    if (!isRequirementsSection && !isLastSection) {
      return {
        shouldAdvance: true,
        reason: 'soft_end_reached',
        jumpToRequirements: true
      };
    }
    // If in requirements or last section, wrapup once the current question is finished
    if (questionsInGroup >= 1) {
      return {
        shouldAdvance: true,
        reason: 'soft_end_reached',
        forceWrapup: true
      };
    }
  }

  // Section time exceeded 150% of durationMinutes
  if (section?.durationMinutes) {
    const maxSectionMs = section.durationMinutes * 60 * 1000 * 1.5;
    if (sectionElapsedMs > maxSectionMs) {
      return {
        shouldAdvance: true,
        reason: 'section_time_exceeded_150'
      };
    }
  }

  // Probe cap reached (max 2 follow-up probes per group)
  if (probesUsed >= 2) {
    return {
      shouldAdvance: true,
      reason: 'probe_cap_reached'
    };
  }

  // If at least 1 question asked, check if all focus targets are either sufficiently_verified or unverified
  if (questionsInGroup >= 1 && group?.focusAreas?.length > 0) {
    const allTargetsResolved = group.focusAreas.every((fa) => {
      const norm = fa.toLowerCase().trim();
      const sKey = Object.keys(skillState).find((k) => k.toLowerCase().trim() === norm);
      const sStatus = sKey ? skillState[sKey]?.status : null;

      const cKey = Object.keys(claimVerification).find((k) => k.toLowerCase().includes(norm));
      const cStatus = cKey ? claimVerification[cKey]?.status : null;

      const targetStatus = sStatus || cStatus;
      return targetStatus === 'sufficiently_verified' || targetStatus === 'unverified';
    });

    if (allTargetsResolved) {
      return {
        shouldAdvance: true,
        reason: 'all_focus_targets_verified_or_unverified'
      };
    }
  }

  return { shouldAdvance: false, reason: null };
}

// ==============================================================================
// 4. Probe Target Selection (Strict Priority Order)
// ==============================================================================

/**
 * Selects probe target following spec §9 strict priority:
 * 1. contradictory
 * 2. partially_verified claim in current project
 * 3. open EG in current group
 * 4. focusArea skill still not_assessed
 */
export function selectProbeTarget({
  currentProject = '',
  group = null,
  skillState = {},
  claimVerification = {},
  evidenceGaps = [],
  claims = []
}) {
  // 1. Contradictory claims or skills
  for (const [key, val] of Object.entries(claimVerification)) {
    if (val?.status === 'contradictory') {
      return {
        targetRef: { type: 'claim', key },
        kind: 'probe',
        priorityRank: 1,
        reason: 'contradictory_claim'
      };
    }
  }
  for (const [key, val] of Object.entries(skillState)) {
    if (val?.status === 'contradictory') {
      return {
        targetRef: { type: 'skill', key },
        kind: 'probe',
        priorityRank: 1,
        reason: 'contradictory_skill'
      };
    }
  }

  // 2. partially_verified claim in current project
  const projectClaims = claims.filter(
    (c) => c.relatedProject && currentProject && c.relatedProject.toLowerCase() === currentProject.toLowerCase()
  );
  for (const c of projectClaims) {
    const status = claimVerification[c.text]?.status;
    if (status === 'partially_verified') {
      return {
        targetRef: { type: 'claim', key: c.text },
        kind: 'probe',
        priorityRank: 2,
        reason: 'partially_verified_project_claim'
      };
    }
  }

  // Also check any claimVerification matching project if text wasn't in explicit projectClaims
  for (const [text, entry] of Object.entries(claimVerification)) {
    if (entry?.status === 'partially_verified') {
      const matchesProject = projectClaims.some((c) => c.text === text);
      if (matchesProject) {
        return {
          targetRef: { type: 'claim', key: text },
          kind: 'probe',
          priorityRank: 2,
          reason: 'partially_verified_project_claim'
        };
      }
    }
  }

  // 3. Open evidence gap (EG) in current group / project
  const openGaps = evidenceGaps.filter((g) => !g.resolved);
  if (openGaps.length > 0) {
    // Prefer gap matching group's focusAreas
    const groupFocus = (group?.focusAreas || []).map((f) => f.toLowerCase().trim());
    const matchingGap = openGaps.find((g) => groupFocus.includes(g.targetRef?.key?.toLowerCase()?.trim())) || openGaps[0];

    return {
      targetRef: matchingGap.targetRef || { type: 'topic', key: matchingGap.description },
      gapId: matchingGap.id,
      kind: 'probe',
      priorityRank: 3,
      reason: 'open_evidence_gap'
    };
  }

  // 4. focusArea skill still not_assessed
  const focusAreas = group?.focusAreas || [];
  for (const fa of focusAreas) {
    const norm = fa.toLowerCase().trim();
    const sKey = Object.keys(skillState).find((k) => k.toLowerCase().trim() === norm);
    const status = sKey ? skillState[sKey]?.status : null;
    if (!status || status === 'not_assessed' || status === 'observed') {
      return {
        targetRef: { type: 'skill', key: fa },
        kind: 'probe',
        priorityRank: 4,
        reason: 'focus_area_not_assessed'
      };
    }
  }

  return null;
}

// ==============================================================================
// 5. Deterministic Status Rules
// ==============================================================================

/**
 * Computes deterministic evidence status update (spec §9):
 *  - strength >= 2 with ownership + technical_depth → sufficiently_verified
 *  - one observed mention → partially_verified
 *  - explicit "I don't know" / no evidence → unverified
 *  - conflict with resume claim → contradictory (flag, don't conclude)
 */
export function evaluateEvidenceStatus({
  evidence = [],
  contradictions = [],
  uncertainty = [],
  hasExplicitNoKnowledge = false,
  answerStatus = 'answered'
}) {
  // 1. Conflict with resume claim
  if ((Array.isArray(contradictions) && contradictions.length > 0) || evidence.some((e) => e.type === 'contradiction')) {
    return 'contradictory';
  }

  // 2. Explicit "I don't know" or no response
  if (hasExplicitNoKnowledge || answerStatus === 'no_response') {
    return 'unverified';
  }

  // 3. No evidence at all
  if (!Array.isArray(evidence) || evidence.length === 0) {
    if (Array.isArray(uncertainty) && uncertainty.length > 0) {
      return 'unverified';
    }
    return 'unverified';
  }

  const maxStrength = Math.max(...evidence.map((e) => (typeof e.strength === 'number' ? e.strength : 0)), 0);
  const types = new Set(evidence.map((e) => e.type));
  const hasOwnership = types.has('ownership');
  const hasTechnicalDepth = types.has('technical_depth');

  // Rule: strength >= 2 with ownership + technical_depth → sufficiently_verified
  if (maxStrength >= 2 && hasOwnership && hasTechnicalDepth) {
    return 'sufficiently_verified';
  }

  // Rule: one observed mention → partially_verified
  if (maxStrength >= 1 || evidence.length >= 1) {
    return 'partially_verified';
  }

  return 'unverified';
}

// ==============================================================================
// 6. Master Step Orchestration
// ==============================================================================

export class InterviewEngine {
  /**
   * Deterministically evaluates the active state and computes the next interview action.
   *
   * @param {Object} state Validated active Redis state (matching redisActiveStateSchema)
   * @param {Object} options Optional overrides (e.g. nowMs for deterministic testing)
   * @returns {Object} { action, phase, sectionIdx, groupIdx, section, project, group, targetRef, kind, difficulty, calibration }
   */
  static getNextAction(state, options = {}) {
    const candidateContext = state.candidate_context || {};
    const assessmentPlan = state.assessment_plan || {};
    const interviewState = state.interview_state || {};
    const progress = interviewState.progress || {};

    const orderedSections = getOrderedSections(assessmentPlan);
    if (orderedSections.length === 0) {
      return {
        action: 'wrapup',
        phase: 'wrapup',
        reason: 'no_sections_in_plan'
      };
    }

    const { softEndMs, hardCapMs } = calculateTimeCaps(assessmentPlan);

    const now = options.nowMs || Date.now();
    const startedAt = progress.startedAt ? new Date(progress.startedAt).getTime() : now;
    const totalElapsedMs = options.elapsedMs !== undefined ? options.elapsedMs : Math.max(0, now - startedAt);
    const remainingMs = Math.max(0, softEndMs - totalElapsedMs);

    let sectionIdx = progress.sectionIdx || 0;
    let groupIdx = progress.groupIdx || 0;
    let questionsInGroup = progress.questionsInGroup || 0;
    let probesUsed = progress.probesUsed || 0;

    // Hard cap termination check
    if (hardCapMs > 0 && totalElapsedMs >= hardCapMs) {
      return {
        action: 'wrapup',
        phase: 'wrapup',
        sectionIdx,
        groupIdx,
        reason: 'hard_cap_reached'
      };
    }

    // Soft end check: jump to requirements or wrapup
    if (softEndMs > 0 && totalElapsedMs >= softEndMs) {
      const reqIdx = orderedSections.findIndex((s) => s.type === 'requirements');
      if (reqIdx !== -1 && sectionIdx < reqIdx) {
        sectionIdx = reqIdx;
        groupIdx = 0;
        questionsInGroup = 0;
        probesUsed = 0;
      } else if (questionsInGroup >= 1) {
        return {
          action: 'wrapup',
          phase: 'wrapup',
          sectionIdx,
          groupIdx,
          reason: 'soft_end_reached'
        };
      }
    }

    // Traversal loop to find valid active section & group (skipping completed/low/sufficiently-verified)
    while (sectionIdx < orderedSections.length) {
      const currentSection = orderedSections[sectionIdx];
      const isProject = currentSection.type === 'project';
      const projectName = isProject ? currentSection.name : '';

      // Skip LOW priority projects if remaining time < 4 min
      if (shouldSkipLowProject(currentSection, remainingMs)) {
        sectionIdx += 1;
        groupIdx = 0;
        questionsInGroup = 0;
        probesUsed = 0;
        continue;
      }

      const groups = currentSection.groups || [];
      if (groups.length === 0) {
        sectionIdx += 1;
        groupIdx = 0;
        questionsInGroup = 0;
        probesUsed = 0;
        continue;
      }

      // If groupIdx is past available groups in this section, advance to next section
      if (groupIdx >= groups.length) {
        sectionIdx += 1;
        groupIdx = 0;
        questionsInGroup = 0;
        probesUsed = 0;
        continue;
      }

      const currentGroup = groups[groupIdx];

      // Skip group if all focusAreas are sufficiently verified (FR-17)
      if (shouldSkipGroup(currentGroup, interviewState.skill_state, interviewState.claim_verification)) {
        groupIdx += 1;
        questionsInGroup = 0;
        probesUsed = 0;
        continue;
      }

      // Calculate approximate section elapsed ms
      const sectionElapsedMs = totalElapsedMs / Math.max(1, orderedSections.length);

      // Check group advance condition
      const advanceEval = checkGroupAdvanceCondition({
        questionsInGroup,
        probesUsed,
        group: currentGroup,
        section: currentSection,
        sectionElapsedMs,
        totalElapsedMs,
        softEndMs,
        hardCapMs,
        skillState: interviewState.skill_state || {},
        claimVerification: interviewState.claim_verification || {},
        isLastSection: sectionIdx === orderedSections.length - 1,
        isRequirementsSection: currentSection.type === 'requirements'
      });

      if (advanceEval.shouldAdvance) {
        if (advanceEval.forceWrapup) {
          return {
            action: 'wrapup',
            phase: 'wrapup',
            sectionIdx,
            groupIdx,
            reason: advanceEval.reason
          };
        }

        if (advanceEval.jumpToRequirements) {
          const reqIdx = orderedSections.findIndex((s) => s.type === 'requirements');
          if (reqIdx !== -1 && reqIdx > sectionIdx) {
            sectionIdx = reqIdx;
            groupIdx = 0;
            questionsInGroup = 0;
            probesUsed = 0;
            continue;
          }
        }

        // Normal group advance
        groupIdx += 1;
        questionsInGroup = 0;
        probesUsed = 0;
        continue;
      }

      // We have an active group!
      const experienceLevel =
        candidateContext.experience?.experienceLevel || assessmentPlan.experienceLevel || 'mid';
      const calibration = calibrateDifficulty(currentGroup.baseDifficulty, experienceLevel);

      // If no question asked yet in this group, generate main question
      if (questionsInGroup === 0) {
        const primaryFocus = currentGroup.focusAreas?.[0] || currentGroup.name;
        return {
          action: 'ask_main',
          phase: currentSection.type,
          sectionIdx,
          groupIdx,
          section: currentSection,
          project: projectName,
          group: currentGroup,
          kind: 'main',
          targetRef: {
            type: currentSection.type === 'requirements' ? 'requirement' : 'topic',
            key: primaryFocus
          },
          difficulty: calibration.calibratedDifficulty,
          calibration,
          reason: 'first_question_in_group'
        };
      }

      // If at least one question has been asked and probesUsed < 2, evaluate probe target
      if (probesUsed < 2) {
        const probeTarget = selectProbeTarget({
          currentProject: projectName,
          group: currentGroup,
          skillState: interviewState.skill_state || {},
          claimVerification: interviewState.claim_verification || {},
          evidenceGaps: interviewState.evidence_gaps || [],
          claims: candidateContext.claims || []
        });

        if (probeTarget) {
          return {
            action: 'probe',
            phase: currentSection.type,
            sectionIdx,
            groupIdx,
            section: currentSection,
            project: projectName,
            group: currentGroup,
            kind: 'probe',
            targetRef: probeTarget.targetRef,
            gapId: probeTarget.gapId || null,
            probePriority: probeTarget.priorityRank,
            difficulty: calibration.calibratedDifficulty,
            calibration,
            reason: probeTarget.reason
          };
        }
      }

      // If no probe needed and questions asked, advance group
      groupIdx += 1;
      questionsInGroup = 0;
      probesUsed = 0;
    }

    // All sections traversed
    return {
      action: 'wrapup',
      phase: 'wrapup',
      sectionIdx,
      groupIdx,
      reason: 'all_sections_completed'
    };
  }
}

export default InterviewEngine;
