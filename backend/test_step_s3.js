/**
 * Step S3 Gate Tests: Interview Engine Deterministic Progression & Rules
 *
 * Verifies all requirements of Step S3 (spec §3.7, §9, §14):
 *  1. Priority ordering: high → medium → low
 *  2. 3 groups per project: Architecture & Design → Implementation → Edge Cases
 *  3. Probe cap: exactly 2 follow-up probes allowed per group
 *  4. Skip logic: FR-17 skip group if all focusAreas sufficiently_verified
 *  5. Time rules: section time > 150%, soft end cap, hard cap termination
 *  6. LOW project skip: skipped when remaining time < 4 min
 *  7. Level calibration: fresher, junior, mid, senior applied to baseDifficulty
 *  8. Probe priority hierarchy: contradictory > partially_verified claim > open EG > not_assessed skill
 *  9. Deterministic status evaluation rules
 */

import assert from 'assert';
import {
  InterviewEngine,
  getOrderedSections,
  calculateTimeCaps,
  calibrateDifficulty,
  shouldSkipGroup,
  shouldSkipLowProject,
  checkGroupAdvanceCondition,
  selectProbeTarget,
  evaluateEvidenceStatus,
  MANDATORY_PROJECT_GROUPS,
  LEVEL_CALIBRATION_GUIDELINES
} from './src/services/interviewEngine.service.js';

console.log('====================================================');
console.log('STEP S3 TEST SUITE: Interview Engine Gate Checks');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// Test Fixtures
// -----------------------------------------------------------------------------

const mockPlan = {
  experienceLevel: 'mid',
  totalYears: 3.5,
  sections: [
    {
      order: 1,
      type: 'intro',
      name: 'Introduction & Background',
      durationMinutes: 5,
      groups: [
        { name: 'Context & Career Overview', baseDifficulty: 'medium', focusAreas: ['career progression'] }
      ]
    },
    {
      order: 2,
      type: 'project',
      name: 'Low Priority Project',
      priority: 'low',
      durationMinutes: 10,
      groups: [
        { name: 'Architecture & Design', baseDifficulty: 'medium', focusAreas: ['low_arch'] },
        { name: 'Implementation & Technical Trade-offs', baseDifficulty: 'medium', focusAreas: ['low_impl'] },
        { name: 'Edge Cases & Operational Lessons', baseDifficulty: 'medium', focusAreas: ['low_ops'] }
      ]
    },
    {
      order: 3,
      type: 'project',
      name: 'High Priority Project',
      priority: 'high',
      durationMinutes: 15,
      groups: [
        { name: 'Architecture & Design', baseDifficulty: 'hard', focusAreas: ['high_arch', 'system flow'] },
        { name: 'Implementation & Technical Trade-offs', baseDifficulty: 'medium', focusAreas: ['high_impl'] },
        { name: 'Edge Cases & Operational Lessons', baseDifficulty: 'hard', focusAreas: ['high_ops'] }
      ]
    },
    {
      order: 4,
      type: 'project',
      name: 'Medium Priority Project',
      priority: 'medium',
      durationMinutes: 10,
      groups: [
        { name: 'Architecture & Design', baseDifficulty: 'medium', focusAreas: ['med_arch'] },
        { name: 'Implementation & Technical Trade-offs', baseDifficulty: 'medium', focusAreas: ['med_impl'] },
        { name: 'Edge Cases & Operational Lessons', baseDifficulty: 'medium', focusAreas: ['med_ops'] }
      ]
    },
    {
      order: 5,
      type: 'requirements',
      name: 'Remaining Job Requirements',
      durationMinutes: 10,
      groups: [
        { name: 'JD Alignment', baseDifficulty: 'medium', focusAreas: ['Kubernetes', 'Microservices'] }
      ]
    }
  ]
};

const buildBaseState = () => ({
  candidate_context: {
    candidateId: 'cand_123',
    name: 'Alex Rivera',
    experience: { experienceLevel: 'mid', totalYears: 3.5 },
    skills: [{ name: 'Node.js' }, { name: 'Kubernetes' }],
    projects: [
      { name: 'High Priority Project', technologies: ['Node.js'] },
      { name: 'Medium Priority Project', technologies: ['Docker'] },
      { name: 'Low Priority Project', technologies: ['PostgreSQL'] }
    ],
    claims: [
      { text: 'Scaled High Priority Project to 10k RPS', relatedProject: 'High Priority Project' }
    ]
  },
  assessment_plan: mockPlan,
  interview_state: {
    current_phase: 'intro',
    current_project: '',
    current_group: 'Context & Career Overview',
    current_question: null,
    question_history: [],
    answer_history: [],
    evidence: [],
    skill_state: {},
    claim_verification: {},
    evidence_gaps: [],
    remaining_areas: [],
    interview_status: 'active',
    progress: {
      sectionIdx: 0,
      groupIdx: 0,
      questionsInGroup: 0,
      probesUsed: 0,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      elapsedMs: 60000
    }
  }
});

// -----------------------------------------------------------------------------
// [GATE 1] Section Ordering: High → Medium → Low
// -----------------------------------------------------------------------------
console.log('[Gate 1] Checking section ordering: Intro → Projects (High → Medium → Low) → Requirements...');
const ordered = getOrderedSections(mockPlan);
assert.strictEqual(ordered.length, 5, 'Should preserve all 5 sections');
assert.strictEqual(ordered[0].type, 'intro', 'First section must be intro');
assert.strictEqual(ordered[1].name, 'High Priority Project', 'First project must be HIGH priority');
assert.strictEqual(ordered[2].name, 'Medium Priority Project', 'Second project must be MEDIUM priority');
assert.strictEqual(ordered[3].name, 'Low Priority Project', 'Third project must be LOW priority');
assert.strictEqual(ordered[4].type, 'requirements', 'Final section must be requirements');
console.log('✓ Section ordering High → Med → Low verified\n');

// -----------------------------------------------------------------------------
// [GATE 2] 3 Groups Per Project: Architecture → Implementation → Edge Cases
// -----------------------------------------------------------------------------
console.log('[Gate 2] Checking 3 mandatory groups per project...');
for (const p of ordered.filter((s) => s.type === 'project')) {
  assert.strictEqual(p.groups.length, 3, `${p.name} must have exactly 3 groups`);
  assert.strictEqual(p.groups[0].name, MANDATORY_PROJECT_GROUPS[0]);
  assert.strictEqual(p.groups[1].name, MANDATORY_PROJECT_GROUPS[1]);
  assert.strictEqual(p.groups[2].name, MANDATORY_PROJECT_GROUPS[2]);
}
console.log('✓ 3 mandatory project groups verified\n');

// -----------------------------------------------------------------------------
// [GATE 3] Probe Cap: Exactly 2 Probes Allowed Per Group
// -----------------------------------------------------------------------------
console.log('[Gate 3] Checking probe cap of max 2 probes per group...');
const stateForProbes = buildBaseState();
// Advance to High Priority Project, Group 1
stateForProbes.interview_state.progress.sectionIdx = 1;
stateForProbes.interview_state.progress.groupIdx = 0;

// Turn 1: Main question
stateForProbes.interview_state.progress.questionsInGroup = 0;
stateForProbes.interview_state.progress.probesUsed = 0;
const act1 = InterviewEngine.getNextAction(stateForProbes, { elapsedMs: 120000 });
assert.strictEqual(act1.action, 'ask_main', 'questionsInGroup=0 must ask main');

// Candidate answers, probesUsed=0, needs follow-up
stateForProbes.interview_state.progress.questionsInGroup = 1;
stateForProbes.interview_state.progress.probesUsed = 0;
// Skill partially verified -> needs probe
stateForProbes.interview_state.skill_state = {
  high_arch: { status: 'partially_verified', evidenceIds: ['e1'], lastUpdated: new Date().toISOString() }
};
const act2 = InterviewEngine.getNextAction(stateForProbes, { elapsedMs: 150000 });
assert.strictEqual(act2.action, 'probe', 'probesUsed=0 must allow probe 1');

// Candidate answers probe 1 -> probesUsed=1
stateForProbes.interview_state.progress.questionsInGroup = 2;
stateForProbes.interview_state.progress.probesUsed = 1;
const act3 = InterviewEngine.getNextAction(stateForProbes, { elapsedMs: 180000 });
assert.strictEqual(act3.action, 'probe', 'probesUsed=1 must allow probe 2');

// Candidate answers probe 2 -> probesUsed=2 (probe cap reached)
stateForProbes.interview_state.progress.questionsInGroup = 3;
stateForProbes.interview_state.progress.probesUsed = 2;
const advanceCheck = checkGroupAdvanceCondition({
  questionsInGroup: 3,
  probesUsed: 2,
  group: ordered[1].groups[0],
  section: ordered[1],
  sectionElapsedMs: 180000,
  totalElapsedMs: 240000,
  softEndMs: 3000000,
  hardCapMs: 3600000
});
assert.strictEqual(advanceCheck.shouldAdvance, true);
assert.strictEqual(advanceCheck.reason, 'probe_cap_reached');

const act4 = InterviewEngine.getNextAction(stateForProbes, { elapsedMs: 200000 });
// Because probesUsed >= 2, group 0 advances to group 1!
assert.strictEqual(act4.groupIdx, 1, 'Group must advance to groupIdx 1 when probe cap is reached');
assert.strictEqual(act4.action, 'ask_main', 'New group must start with ask_main');
console.log('✓ Probe cap enforced (exactly 2 probes then advances group)\n');

// -----------------------------------------------------------------------------
// [GATE 4] Skip Logic (FR-17): Skip Group If All focusAreas sufficiently_verified
// -----------------------------------------------------------------------------
console.log('[Gate 4] Checking FR-17 group skip logic...');
const groupToTest = {
  name: 'Architecture & Design',
  focusAreas: ['modular design', 'system flow']
};

// Case 4a: Neither verified
assert.strictEqual(shouldSkipGroup(groupToTest, {}, {}), false, 'Not verified should not skip');

// Case 4b: Only one verified
assert.strictEqual(
  shouldSkipGroup(
    groupToTest,
    { 'modular design': { status: 'sufficiently_verified' } },
    {}
  ),
  false,
  'Partial focus verified should not skip'
);

// Case 4c: Both sufficiently verified
assert.strictEqual(
  shouldSkipGroup(
    groupToTest,
    {
      'modular design': { status: 'sufficiently_verified' },
      'system flow': { status: 'sufficiently_verified' }
    },
    {}
  ),
  true,
  'All focusAreas verified MUST skip group'
);

// Engine skips automatically in getNextAction
const stateForSkip = buildBaseState();
stateForSkip.interview_state.progress.sectionIdx = 1; // High Priority Project
stateForSkip.interview_state.progress.groupIdx = 0; // Group 0 has focusAreas ['high_arch', 'system flow']
stateForSkip.interview_state.skill_state = {
  high_arch: { status: 'sufficiently_verified' },
  'system flow': { status: 'sufficiently_verified' }
};
const actSkip = InterviewEngine.getNextAction(stateForSkip, { elapsedMs: 120000 });
assert.strictEqual(actSkip.groupIdx, 1, 'Engine must skip group 0 and proceed directly to group 1');
console.log('✓ FR-17 group skip logic verified\n');

// -----------------------------------------------------------------------------
// [GATE 5] Time Rules: Section 150%, Soft End, Hard Cap
// -----------------------------------------------------------------------------
console.log('[Gate 5] Checking section time limit (150%), soft end, and hard cap...');
const caps = calculateTimeCaps(mockPlan);
// Mock plan durations: 5 + 10 + 15 + 10 + 10 = 50 min
assert.strictEqual(caps.softEndMinutes, 50);
assert.strictEqual(caps.softEndMs, 50 * 60 * 1000);
assert.strictEqual(caps.hardCapMs, 60 * 60 * 1000); // soft + 10 min

// Case 5a: Section exceeded 150% of duration (10 min section -> 15 min exceeded)
const secExceed = checkGroupAdvanceCondition({
  questionsInGroup: 1,
  probesUsed: 0,
  section: { durationMinutes: 10 },
  sectionElapsedMs: 16 * 60 * 1000, // 16 min > 15 min (150%)
  totalElapsedMs: 20 * 60 * 1000
});
assert.strictEqual(secExceed.shouldAdvance, true);
assert.strictEqual(secExceed.reason, 'section_time_exceeded_150');

// Case 5b: Soft end reached -> jump to requirements if not yet completed
const stateSoftEnd = buildBaseState();
stateSoftEnd.interview_state.progress.sectionIdx = 1; // Still in project
const actSoft = InterviewEngine.getNextAction(stateSoftEnd, { elapsedMs: 50 * 60 * 1000 + 1000 });
assert.strictEqual(actSoft.phase, 'requirements', 'Soft end must jump to requirements section');

// Case 5c: Hard cap reached -> force wrapup immediately
const stateHardEnd = buildBaseState();
const actHard = InterviewEngine.getNextAction(stateHardEnd, { elapsedMs: 60 * 60 * 1000 + 1000 });
assert.strictEqual(actHard.action, 'wrapup', 'Hard cap must force wrapup');
assert.strictEqual(actHard.reason, 'hard_cap_reached');
console.log('✓ Section 150% time limit, soft end jump, and hard cap wrapup verified\n');

// -----------------------------------------------------------------------------
// [GATE 6] LOW Project Skip (Time < 4 min)
// -----------------------------------------------------------------------------
console.log('[Gate 6] Checking LOW project skip when remaining time < 4 min...');
const lowProject = { type: 'project', priority: 'low', name: 'Low Priority Project' };
const highProject = { type: 'project', priority: 'high', name: 'High Priority Project' };

// Less than 4 minutes remaining (e.g. 3.5 minutes = 210,000 ms)
assert.strictEqual(shouldSkipLowProject(lowProject, 210000), true, 'LOW project with 3.5m remaining must be skipped');
assert.strictEqual(shouldSkipLowProject(highProject, 210000), false, 'HIGH project must NEVER be skipped by remaining time');
assert.strictEqual(shouldSkipLowProject(lowProject, 300000), false, 'LOW project with 5m remaining must not be skipped');

// Engine skips LOW project during traversal
const stateLowSkip = buildBaseState();
// Set progress to sectionIdx 3 (Low Priority Project)
stateLowSkip.interview_state.progress.sectionIdx = 3;
// Total elapsed leaves only 2 minutes before soft end (50 min - 48 min = 2 min remaining)
const actLowSkip = InterviewEngine.getNextAction(stateLowSkip, { elapsedMs: 48 * 60 * 1000 });
assert.strictEqual(actLowSkip.phase, 'requirements', 'Engine must skip LOW project and advance to requirements');
console.log('✓ LOW project skip (< 4 min remaining) verified\n');

// -----------------------------------------------------------------------------
// [GATE 7] Experience Level Calibration (Fresher, Junior, Mid, Senior)
// -----------------------------------------------------------------------------
console.log('[Gate 7] Checking level calibration applied to baseDifficulty...');
const calFresher = calibrateDifficulty('easy', 'fresher');
assert.strictEqual(calFresher.calibratedDifficulty, 'fresher_easy');
assert.strictEqual(calFresher.experienceLevel, 'fresher');
assert.strictEqual(calFresher.guideline, LEVEL_CALIBRATION_GUIDELINES.fresher.guideline);

const calJunior = calibrateDifficulty('medium', 'junior');
assert.strictEqual(calJunior.calibratedDifficulty, 'junior_medium');
assert.strictEqual(calJunior.experienceLevel, 'junior');

const calMid = calibrateDifficulty('medium', 'mid');
assert.strictEqual(calMid.calibratedDifficulty, 'mid_medium');
assert.strictEqual(calMid.experienceLevel, 'mid');

const calSenior = calibrateDifficulty('hard', 'senior');
assert.strictEqual(calSenior.calibratedDifficulty, 'senior_hard');
assert.strictEqual(calSenior.experienceLevel, 'senior');
assert.strictEqual(calSenior.guideline, LEVEL_CALIBRATION_GUIDELINES.senior.guideline);
console.log('✓ Experience level calibrations verified across all 4 levels\n');

// -----------------------------------------------------------------------------
// [GATE 8] Probe Priority Hierarchy
// -----------------------------------------------------------------------------
console.log('[Gate 8] Checking probe priority: Contradictory > Partially Verified Claim > Open EG > Not Assessed Skill...');
// Case 8a: Contradictory present -> Priority 1
const probeContradictory = selectProbeTarget({
  currentProject: 'High Priority Project',
  group: { focusAreas: ['skillA'] },
  claimVerification: { 'Claim A': { status: 'contradictory' } },
  skillState: { skillA: { status: 'not_assessed' } },
  evidenceGaps: [{ id: 'gap_1', description: 'Gap 1', resolved: false }],
  claims: [{ text: 'Claim A', relatedProject: 'High Priority Project' }]
});
assert.strictEqual(probeContradictory.priorityRank, 1, 'Contradictory must have priority 1');
assert.strictEqual(probeContradictory.targetRef.type, 'claim');
assert.strictEqual(probeContradictory.targetRef.key, 'Claim A');

// Case 8b: Partially verified claim in project -> Priority 2
const probePartialClaim = selectProbeTarget({
  currentProject: 'High Priority Project',
  group: { focusAreas: ['skillA'] },
  claimVerification: { 'Claim A': { status: 'partially_verified' } },
  skillState: { skillA: { status: 'not_assessed' } },
  evidenceGaps: [{ id: 'gap_1', description: 'Gap 1', resolved: false }],
  claims: [{ text: 'Claim A', relatedProject: 'High Priority Project' }]
});
assert.strictEqual(probePartialClaim.priorityRank, 2, 'Partially verified claim must have priority 2');
assert.strictEqual(probePartialClaim.targetRef.key, 'Claim A');

// Case 8c: Open evidence gap in group -> Priority 3
const probeOpenGap = selectProbeTarget({
  currentProject: 'High Priority Project',
  group: { focusAreas: ['skillA'] },
  claimVerification: {},
  skillState: { skillA: { status: 'not_assessed' } },
  evidenceGaps: [{ id: 'gap_1', targetRef: { type: 'topic', key: 'skillA' }, description: 'Unclear role', resolved: false }],
  claims: []
});
assert.strictEqual(probeOpenGap.priorityRank, 3, 'Open evidence gap must have priority 3');
assert.strictEqual(probeOpenGap.gapId, 'gap_1');

// Case 8d: FocusArea skill not assessed -> Priority 4
const probeNotAssessed = selectProbeTarget({
  currentProject: 'High Priority Project',
  group: { focusAreas: ['skillA'] },
  claimVerification: {},
  skillState: { skillA: { status: 'not_assessed' } },
  evidenceGaps: [],
  claims: []
});
assert.strictEqual(probeNotAssessed.priorityRank, 4, 'Focus area not assessed must have priority 4');
assert.strictEqual(probeNotAssessed.targetRef.key, 'skillA');
console.log('✓ Probe priority hierarchy verified 1 through 4\n');

// -----------------------------------------------------------------------------
// [GATE 9] Status Evaluation Rules (Deterministic Code Logic)
// -----------------------------------------------------------------------------
console.log('[Gate 9] Checking deterministic status evaluation rules...');
// 9a. Contradiction
assert.strictEqual(
  evaluateEvidenceStatus({
    evidence: [{ type: 'contradiction', strength: 2 }],
    contradictions: ['Conflicted with earlier statement']
  }),
  'contradictory'
);

// 9b. Explicit "I don't know" / no response
assert.strictEqual(
  evaluateEvidenceStatus({
    hasExplicitNoKnowledge: true,
    evidence: []
  }),
  'unverified'
);
assert.strictEqual(
  evaluateEvidenceStatus({
    answerStatus: 'no_response',
    evidence: []
  }),
  'unverified'
);

// 9c. strength >= 2 with ownership + technical_depth -> sufficiently_verified
assert.strictEqual(
  evaluateEvidenceStatus({
    evidence: [
      { type: 'ownership', strength: 2 },
      { type: 'technical_depth', strength: 2 }
    ]
  }),
  'sufficiently_verified'
);

// 9d. Only ownership without technical_depth (or strength < 2) -> partially_verified
assert.strictEqual(
  evaluateEvidenceStatus({
    evidence: [{ type: 'ownership', strength: 1 }]
  }),
  'partially_verified'
);

// 9e. Single observed mention -> partially_verified
assert.strictEqual(
  evaluateEvidenceStatus({
    evidence: [{ type: 'tradeoff', strength: 1 }]
  }),
  'partially_verified'
);

// 9f. No evidence -> unverified
assert.strictEqual(
  evaluateEvidenceStatus({
    evidence: [],
    uncertainty: ['vague']
  }),
  'unverified'
);
console.log('✓ Deterministic status evaluation rules verified\n');

console.log('====================================================');
console.log('ALL STEP S3 TESTS PASSED 100% ✓');
console.log('====================================================');

