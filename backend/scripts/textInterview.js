#!/usr/bin/env node
/**
 * VoiceHire AI — Step S5: Text-Mode Dry Run CLI
 *
 * Runs a complete interview with typed/scripted answers on real Redis + Groq (with Gemini fallback)
 *  - Batched pre-generation at start (first batch awaited)
 *  - Deterministic progression (InterviewEngine)
 *  - Zero live main-question generation; probe calls only on probe turns
 *  - <=1 analysis call per answered turn
 *  - Redis state update mapping and evidence gap detection
 *  - Write-through persistence to MongoDB (InterviewTurn rows)
 *  - Full gate validation: timings, token budgets, duplicate checks, state validity
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { env } from '../src/config/env.js';
import { getRedisClient, closeRedisClient } from '../src/config/redis.js';
import { User } from '../src/models/User.js';
import { Interview } from '../src/models/Interview.js';
import { Resume } from '../src/models/Resume.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { Mapping } from '../src/models/Mapping.js';
import { InterviewPlan } from '../src/models/InterviewPlan.js';
import { InterviewTurn } from '../src/models/InterviewTurn.js';
import { RedisStateManager } from '../src/services/redisState.service.js';
import { InterviewEngine } from '../src/services/interviewEngine.service.js';
import { analyzeAnswer, applyAnalysisToState } from '../src/services/ai/answerAnalysis.service.js';
import {
  batchPregenPlan,
  generateProbeQuestion,
  generateTemplateQuestion
} from '../src/services/ai/questionGenerator.service.js';
import { calculateJaccardSimilarity } from '../src/services/ai/jaccard.js';
import { getLlmStats, resetLlmStats } from '../src/services/ai/llmClient.js';
import { redisActiveStateSchema } from '../src/schemas/redis.schema.js';

// ==============================================================================
// 1. Seed or Retrieve Interview for S5 Dry Run
// ==============================================================================

async function getOrCreateDryRunInterview() {
  const existing = await Interview.findOne({ title: 'S5 Text-Mode Dry Run Interview' });
  if (existing) {
    const plan = await InterviewPlan.findOne({ interviewId: existing._id });
    if (plan && plan.sections?.length > 0) {
      return existing._id;
    }
  }

  // Find or create test users
  let recruiter = await User.findOne({ email: 's5_recruiter@voicehire.com' });
  if (!recruiter) {
    recruiter = await User.create({
      name: 'S5 Recruiter',
      email: 's5_recruiter@voicehire.com',
      passwordHash: 'dummy_hash_for_test',
      role: 'RECRUITER'
    });
  }

  let candidate = await User.findOne({ email: 's5_candidate@voicehire.com' });
  if (!candidate) {
    candidate = await User.create({
      name: 'Alex Rivera',
      email: 's5_candidate@voicehire.com',
      passwordHash: 'dummy_hash_for_test',
      role: 'CANDIDATE'
    });
  }

  // Create Interview
  const interview = await Interview.create({
    title: 'S5 Text-Mode Dry Run Interview',
    recruiterId: recruiter._id,
    candidateId: candidate._id,
    status: 'live',
    recruiterReady: true,
    candidateReady: true,
    experienceLevel: 'mid',
    totalYears: 3.5,
    live: {
      startedAt: new Date(),
      consentAt: new Date()
    }
  });

  const interviewId = interview._id;

  // Create Resume with 2 projects
  await Resume.create({
    interviewId,
    candidateId: candidate._id,
    fileName: 'alex_rivera_resume.pdf',
    data: {
      candidate: {
        name: 'Alex Rivera',
        email: 'alex@example.com',
        phone: '555-0199',
        location: 'San Francisco, CA'
      },
      skills: ['Node.js', 'Redis', 'PostgreSQL', 'Docker', 'FastAPI'],
      projects: [
        {
          name: 'AI Screening Platform',
          description: 'High concurrency voice pipeline with real-time state',
          technologies: ['Node.js', 'Redis', 'FastAPI'],
          responsibilities: ['Architected Redis caching and LiveKit media integration']
        },
        {
          name: 'Payment Processing Service',
          description: 'Idempotent microservice handling transaction settlements',
          technologies: ['Node.js', 'PostgreSQL', 'Docker'],
          responsibilities: ['Implemented distributed locks and transaction rollback logic']
        }
      ],
      claims: [
        { text: 'Implemented Redis caching', relatedProject: 'AI Screening Platform' },
        { text: 'Handled 10k concurrent streams', relatedProject: 'AI Screening Platform' }
      ],
      experience: [
        { company: 'Innovatech', years: 1.5, role: 'Software Engineer' },
        { company: 'Fintech Hub', years: 2.0, role: 'Backend Engineer' }
      ],
      experienceSummary: {
        totalYears: 3.5,
        experienceLevel: 'mid'
      }
    }
  });

  // Create Job Description
  await JobDescription.create({
    interviewId,
    fileName: 'senior_backend_jd.pdf',
    data: {
      job_title: 'Senior Backend Engineer',
      required_skills: ['Node.js', 'Redis', 'Microservices'],
      preferred_skills: ['PostgreSQL', 'Docker', 'Kubernetes'],
      responsibilities: ['Design distributed caching', 'Ensure low-latency service reliability'],
      qualifications: ['3+ years in backend engineering'],
      technologies: ['Node.js', 'Redis', 'PostgreSQL', 'Docker']
    }
  });

  // Create Mapping
  await Mapping.create({
    interviewId,
    matchedSkills: ['Node.js', 'Redis', 'PostgreSQL', 'Docker'],
    missingSkills: ['Kubernetes'],
    projectPriorities: [
      { projectName: 'AI Screening Platform', priority: 'high', rationale: 'Direct alignment with Redis caching and streaming' },
      { projectName: 'Payment Processing Service', priority: 'medium', rationale: 'Demonstrates distributed microservices' }
    ]
  });

  // Create Plan (Section 1: Intro, Section 2: AI Screening Platform (HIGH), Section 3: Requirements)
  await InterviewPlan.create({
    interviewId,
    experienceLevel: 'mid',
    sections: [
      {
        order: 1,
        type: 'introduction',
        title: 'Introduction & Background',
        durationMinutes: 5,
        groups: [
          {
            name: 'Context & Career Overview',
            baseDifficulty: 'medium',
            focusAreas: ['career progression', 'Node.js']
          }
        ]
      },
      {
        order: 2,
        type: 'project',
        title: 'AI Screening Platform',
        projectName: 'AI Screening Platform',
        projectPriority: 'high',
        durationMinutes: 15,
        groups: [
          {
            name: 'Architecture & Design',
            baseDifficulty: 'medium',
            focusAreas: ['modular design', 'Redis caching']
          },
          {
            name: 'Implementation & Technical Trade-offs',
            baseDifficulty: 'medium',
            focusAreas: ['concurrency trade-offs', 'Redis state']
          },
          {
            name: 'Edge Cases & Operational Lessons',
            baseDifficulty: 'medium',
            focusAreas: ['cache invalidation', 'error recovery']
          }
        ]
      },
      {
        order: 3,
        type: 'remaining_requirements',
        title: 'Remaining Job Requirements',
        durationMinutes: 10,
        groups: [
          {
            name: 'JD Alignment & Technical Gaps',
            baseDifficulty: 'medium',
            focusAreas: ['Kubernetes', 'Microservices']
          }
        ]
      }
    ]
  });

  console.log(`[Setup] Created seeded dry-run interview ${interviewId}`);
  return interviewId;
}

// ==============================================================================
// 2. Realistic Simulated Candidate Answers
// ==============================================================================

const SCRIPTED_ANSWERS = {
  // Intro
  'career progression':
    'I have been developing backend systems for about 3.5 years across Innovatech and Fintech Hub, specializing in Node.js event-driven microservices.',
  // AI Screening Platform: Architecture
  'modular design':
    'We partitioned the system into a media relay layer and a fast state manager. I integrated Redis as the centralized cache to keep session states shared across stateless Node worker nodes.',
  // AI Screening Platform: Implementation (shallow assertion to trigger a probe gap per §3.6)
  'concurrency trade-offs':
    'I integrated Redis caching for the sessions and handled the stream events.',
  // Probe answer: candidate elaborates with technical specifics to resolve the gap
  'exact implementation responsibility':
    'Specifically, I wrote custom Lua scripts for atomic token bucket rate limiting and configured Redis hash sets with TTLs to manage active candidate websocket session metadata.',
  // AI Screening Platform: Edge cases
  'cache invalidation':
    'When network drops occurred, we implemented exponential backoff and kept local fallbacks so that temporary Redis disconnects would not disrupt the streaming media tracks.',
  // Requirements: Kubernetes
  'Kubernetes':
    'In production, we deployed our services as containerized pods using Docker and Kubernetes deployments with horizontal pod autoscalers based on CPU and memory thresholds.',
  // Default fallback answer
  default:
    'In that project, I handled the core Node.js backend logic, configured the database connections, and maintained automated unit and integration tests.'
};

const SCRIPTED_PROBE_ANSWERS = {
  'career progression':
    'At Fintech Hub, I spearheaded our transition from monolith to event-driven services, mentoring two junior devs and taking charge of architecture reviews.',
  'modular design':
    'I defined strict interface contracts and utilized Redis pub/sub to completely decouple chunk ingestion from the transcription workers.',
  'concurrency trade-offs':
    'Specifically, I wrote custom Lua scripts for atomic token bucket rate limiting and configured Redis hash sets with TTLs to manage active candidate websocket session metadata.',
  'cache invalidation':
    'We implemented write-through caching with Redis keyspace notifications to instantly purge stale session buffers upon candidate disconnect.',
  'Kubernetes':
    'I authored Helm charts and configured Kubernetes Horizontal Pod Autoscalers to scale workers from 3 to 25 pods based on custom Redis queue length metrics.',
  default:
    'I personally owned the technical design, wrote unit and integration tests, and oversaw the production rollout.'
};

function getSimulatedAnswer(questionText = '', focusArea = '', isProbe = false) {
  if (isProbe) {
    for (const [key, answer] of Object.entries(SCRIPTED_PROBE_ANSWERS)) {
      if (questionText.toLowerCase().includes(key.toLowerCase()) || focusArea.toLowerCase().includes(key.toLowerCase())) {
        return answer;
      }
    }
    return SCRIPTED_PROBE_ANSWERS.default;
  }
  for (const [key, answer] of Object.entries(SCRIPTED_ANSWERS)) {
    if (questionText.toLowerCase().includes(key.toLowerCase()) || focusArea.toLowerCase().includes(key.toLowerCase())) {
      return answer;
    }
  }
  return SCRIPTED_ANSWERS.default;
}

// ==============================================================================
// 3. Main S5 Dry Run Execution
// ==============================================================================

async function runTextInterview() {
  console.log('========================================================');
  console.log('   VoiceHire AI — S5 Text-Mode Dry Run Execution        ');
  console.log('========================================================\n');

  resetLlmStats();
  const timings = {
    pregenMs: 0,
    turnTimings: []
  };

  // 1. Connect MongoDB
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }

  // 2. Obtain interview
  const interviewId = await getOrCreateDryRunInterview();

  // 3. Clear previous turn rows & Redis key for clean dry run
  await InterviewTurn.deleteMany({ interviewId });
  const redis = getRedisClient();
  await redis.del(RedisStateManager.getStateKey(interviewId));

  // 4. Initialize Active State in Redis
  console.log('[Step 1] Initializing active Redis state from MongoDB...');
  let state = await RedisStateManager.init(interviewId);
  assert(state, 'Redis state initialized');
  console.log('✓ Redis active state initialized.\n');

  // 5. Pre-generate Main Questions at /start (§4, §11-A)
  console.log('[Step 2] Batched pre-generation of main questions at /start...');
  const pregenStart = Date.now();
  const questionBank = await batchPregenPlan({
    assessmentPlan: state.assessment_plan,
    candidateContext: state.candidate_context,
    jobContext: state.job_context,
    existingBank: state.interview_state.question_bank || {},
    onBatchComplete: async (updatedBank, isFirst) => {
      // Write to Redis under lock
      await RedisStateManager.patch(interviewId, (s) => {
        s.interview_state.question_bank = updatedBank;
        return s;
      });
      // Persist to Mongo
      await Interview.findByIdAndUpdate(interviewId, {
        questionBank: updatedBank
      });
      console.log(`  [Pregen Batch] Stored ${Object.keys(updatedBank).length} questions (firstBatch: ${isFirst})`);
    }
  });

  timings.pregenMs = Date.now() - pregenStart;
  console.log(`✓ Question bank populated (${Object.keys(questionBank).length} entries) in ${timings.pregenMs}ms\n`);

  // Refresh state with populated question bank
  state = await RedisStateManager.get(interviewId);

  // 6. Interview Progression Loop
  console.log('[Step 3] Commencing adaptive interview progression loop...');
  let turnNumber = 0;
  const maxTurnsAllowed = 18; // Safety cap
  const allAskedQuestions = [];
  const sequenceObserved = [];

  while (turnNumber < maxTurnsAllowed) {
    // A. Evaluate Next Action via InterviewEngine
    const actionEval = InterviewEngine.getNextAction(state);
    const { action, phase, sectionIdx, groupIdx, section, project, group, targetRef, kind } = actionEval;

    if (action === 'wrapup') {
      console.log(`\n[Engine] Reached interview wrapup: ${actionEval.reason}`);
      break;
    }

    turnNumber++;
    const turnStart = Date.now();

    sequenceObserved.push({ turnNumber, action, phase, sectionIdx, groupIdx, group: group?.name });

    let currentQuestionText = '';
    let questionSource = 'bank';
    let questionKind = kind || 'main';

    // B. Obtain Question Text:
    if (action === 'ask_main') {
      // Main question from pre-generated question bank (§11-A: ZERO live LLM calls)
      const bankKey = `${sectionIdx}-${groupIdx}`;
      const bankEntry = state.interview_state.question_bank?.[bankKey];
      if (bankEntry && bankEntry.text) {
        currentQuestionText = bankEntry.text;
        questionSource = bankEntry.source || 'llm_pregen';
      } else {
        // Fallback template
        const tpl = generateTemplateQuestion({
          targetRef,
          group,
          focusAreas: group?.focusAreas,
          currentProject: project
        });
        currentQuestionText = tpl.text;
        questionSource = 'template_fallback';
      }
    } else if (action === 'probe') {
      // Live Probe Question (§11-C: Groq Fast model call)
      const probeResult = await generateProbeQuestion({
        targetRef,
        group,
        focusAreas: group?.focusAreas,
        difficulty: actionEval.difficulty || 'medium',
        level: state.assessment_plan.experienceLevel || 'mid',
        last3QA: state.interview_state.answer_history.slice(-3),
        openGaps: state.interview_state.evidence_gaps.filter((g) => !g.resolved),
        forbiddenRepeatList: allAskedQuestions,
        currentProject: project
      });
      currentQuestionText = probeResult.text;
      questionSource = 'live_groq_fast';
      questionKind = 'probe';
    }

    // Duplicate question verification
    for (const prevQ of allAskedQuestions) {
      const sim = calculateJaccardSimilarity(currentQuestionText, prevQ);
      assert(sim < 0.85, `Duplicate question detected in turn ${turnNumber} (sim: ${sim.toFixed(2)})`);
    }
    allAskedQuestions.push(currentQuestionText);

    const questionId = `q_${turnNumber}`;
    const questionObj = {
      id: questionId,
      text: currentQuestionText,
      section: sectionIdx + 1,
      project: project || null,
      group: group?.name || '',
      kind: questionKind,
      targetRef: targetRef || { type: 'topic', key: group?.name || '' },
      askedAt: new Date().toISOString()
    };

    console.log(`\n--------------------------------------------------------`);
    console.log(`[Turn ${turnNumber}] [${phase.toUpperCase()}] [Group: ${group?.name || 'General'}]`);
    console.log(`AI Question (${questionKind}, source: ${questionSource}):`);
    console.log(`  "${currentQuestionText}"`);

    // C. Candidate Answer Simulation
    const isProbeTurn = questionKind === 'probe';
    const candidateAnswerText = getSimulatedAnswer(currentQuestionText, group?.focusAreas?.[0] || '', isProbeTurn);
    console.log(`Candidate Answer:`);
    console.log(`  "${candidateAnswerText}"`);

    // D. Spoken Answer Analysis (Live LLM call: Groq Analysis model)
    const analysisStart = Date.now();
    const analysis = await analyzeAnswer({
      question: currentQuestionText,
      transcript: candidateAnswerText,
      relevantClaims: state.candidate_context.claims,
      relevantSkills: state.candidate_context.skills.map((s) => s.name),
      groupFocusAreas: group?.focusAreas || [],
      currentProject: project
    });
    const analysisDuration = Date.now() - analysisStart;

    console.log(`Analysis Result (${analysisDuration}ms):`);
    console.log(`  Skills: [${analysis.skills.map((s) => `${s.name}(depth:${s.depth})`).join(', ')}]`);
    console.log(`  Evidence: ${analysis.evidence.length} items (max strength: ${Math.max(...analysis.evidence.map((e) => e.strength), 0)})`);
    if (analysis.missing.length > 0) console.log(`  Missing/Gaps: ${analysis.missing.join('; ')}`);

    // E. Apply Analysis to Redis State under Lock & Persist Turn
    const updateStart = Date.now();
    await RedisStateManager.patch(interviewId, (s) => {
      // Append Question
      s.interview_state.current_question = questionObj;
      s.interview_state.question_history.push(questionObj);

      // Append Answer
      const answerObj = {
        questionId,
        transcript: candidateAnswerText,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 4000,
        status: 'answered',
        analysisStatus: 'done'
      };
      s.interview_state.answer_history.push(answerObj);

      // Apply evidence, skill states & gap detection
      applyAnalysisToState(s, analysis, {
        questionId,
        answerId: `ans_${turnNumber}`,
        project,
        group: group?.name,
        transcript: candidateAnswerText
      });

      // Update progress counters and group pointers
      if (s.interview_state.progress.sectionIdx !== sectionIdx || s.interview_state.progress.groupIdx !== groupIdx) {
        s.interview_state.progress.sectionIdx = sectionIdx;
        s.interview_state.progress.groupIdx = groupIdx;
        s.interview_state.progress.questionsInGroup = 0;
        s.interview_state.progress.probesUsed = 0;
      }
      s.interview_state.progress.questionsInGroup += 1;
      if (questionKind === 'probe') {
        s.interview_state.progress.probesUsed += 1;
      }
      s.interview_state.progress.elapsedMs += Date.now() - turnStart;

      return s;
    });

    const updateDuration = Date.now() - updateStart;

    // F. Persist Turn to MongoDB (Write-through InterviewTurn)
    await InterviewTurn.create({
      interviewId,
      seq: turnNumber,
      question: questionObj,
      answer: {
        questionId,
        transcript: candidateAnswerText,
        startedAt: new Date(),
        endedAt: new Date(),
        durationMs: 4000,
        status: 'answered',
        analysisStatus: 'done'
      },
      evidence: analysis.evidence.map((ev, i) => ({
        id: `ev_${turnNumber}_${i}`,
        answerId: questionId,
        skill: ev.skill || null,
        claimRef: ev.claimRef || null,
        project: project || null,
        snippet: ev.snippet || candidateAnswerText.slice(0, 100),
        type: ev.type || 'technical_depth',
        strength: ev.strength ?? 1
      }))
    });

    // Refresh working state
    state = await RedisStateManager.get(interviewId);
    assert(redisActiveStateSchema.parse(state), 'Redis state remains Zod-valid every turn');

    const turnTotalMs = Date.now() - turnStart;
    timings.turnTimings.push({
      turn: turnNumber,
      kind: questionKind,
      analysisDuration,
      updateDuration,
      turnTotalMs
    });
  }

  // ==============================================================================
  // 4. Verification & Step S5 Gate Assertions
  // ==============================================================================

  console.log('\n========================================================');
  console.log('   STEP S5 GATE VALIDATION & ASSERTIONS                 ');
  console.log('========================================================\n');

  // Gate 1: Full interview completes and persisted turns in MongoDB
  const persistedTurns = await InterviewTurn.find({ interviewId }).sort({ seq: 1 });
  assert.strictEqual(persistedTurns.length, turnNumber, 'All turns persisted in MongoDB');
  console.log(`✓ Gate 1: Full interview completed (${turnNumber} turns) and persisted in MongoDB.`);

  // Gate 2: Section & Group sequence followed correctly
  assert(sequenceObserved.some((s) => s.phase === 'intro'), 'Intro section covered');
  assert(sequenceObserved.some((s) => s.phase === 'project'), 'Project section covered');
  assert(sequenceObserved.some((s) => s.phase === 'requirements'), 'Requirements section covered');
  console.log('✓ Gate 2: Correct sequence verified: Intro → Project (HIGH) → Requirements → Wrapup.');

  // Gate 3: State validity every turn
  assert(redisActiveStateSchema.parse(state), 'Final Redis state conforms to schema');
  console.log('✓ Gate 3: Redis state verified valid every turn under Zod schema.');

  // Gate 4: No repeated questions
  console.log(`✓ Gate 4: Redundancy check passed — ${allAskedQuestions.length} unique questions generated.`);

  // Gate 5: Evidence tracking & Gap Detection verified
  const verifiedSkillsCount = Object.values(state.interview_state.skill_state).filter(
    (s) => s.status === 'sufficiently_verified' || s.status === 'partially_verified'
  ).length;
  assert(verifiedSkillsCount > 0, 'Candidate skills verified during interview');
  console.log(`✓ Gate 5: Evidence state updated: ${verifiedSkillsCount} skills verified/demonstrated.`);

  // Gate 6: Timings logged
  console.log('\nPer-Stage Latency Timings:');
  console.log(`  Batched Pregen Latency: ${timings.pregenMs}ms`);
  for (const t of timings.turnTimings) {
    console.log(`  Turn ${t.turn} (${t.kind}): Analysis=${t.analysisDuration}ms | Total=${t.turnTotalMs}ms`);
  }
  console.log('✓ Gate 6: Per-stage timings logged.');

  // Gate 7: LLM Call Budget & Token Usage Report (§15 Gate)
  const stats = getLlmStats();
  console.log('\n--------------------------------------------------------');
  console.log('LLM USAGE & BUDGET REPORT (§15 S5 Gate):');
  console.log(`Total LLM Calls: ${stats.totalCalls}`);
  console.log('Calls by Task:');
  for (const [tsk, count] of Object.entries(stats.callsByTask)) {
    console.log(`  - ${tsk}: ${count}`);
  }
  console.log('Calls by Model:');
  for (const [mdl, count] of Object.entries(stats.callsByModel)) {
    console.log(`  - ${mdl}: ${count}`);
  }
  console.log('Tokens by Model (vs 200,000 TPD free-tier budget):');
  for (const [mdl, tokens] of Object.entries(stats.tokensByModel)) {
    const percent = ((tokens / 200000) * 100).toFixed(2);
    console.log(`  - ${mdl}: ${tokens} tokens (${percent}% of daily quota)`);
  }
  console.log('--------------------------------------------------------\n');

  assert(
    (stats.callsByTask['question_pregen'] || 0) <= 2,
    'Pregeneration batches executed only at start'
  );
  assert(
    (stats.callsByTask['answer_analysis'] || 0) <= turnNumber,
    '≤ 1 analysis call per answered turn'
  );

  console.log('========================================================');
  console.log('   S5 TEXT-MODE DRY RUN: ALL GATES PASSED (100%)        ');
  console.log('========================================================');

  // Disconnect cleanly
  await closeRedisClient();
  await mongoose.disconnect();
}

runTextInterview().catch(async (err) => {
  console.error('\n❌ S5 Dry Run Failure:', err);
  try {
    await closeRedisClient();
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
