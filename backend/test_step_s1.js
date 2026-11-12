import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { getRedisClient, closeRedisClient } from './src/config/redis.js';
import { Interview } from './src/models/Interview.js';
import { Resume } from './src/models/Resume.js';
import { JobDescription } from './src/models/JobDescription.js';
import { Mapping } from './src/models/Mapping.js';
import { InterviewPlan } from './src/models/InterviewPlan.js';
import { InterviewTurn } from './src/models/InterviewTurn.js';
import { User } from './src/models/User.js';
import {
  redisActiveStateSchema,
  normalizePriority,
  RedisStateService
} from './src/schemas/redis.schema.js';
import {
  RedisStateManager,
  MissingInterviewDataError
} from './src/services/redisState.service.js';

const runS1Tests = async () => {
  console.log('====================================================');
  console.log('STEP S1 TEST SUITE: Schema + Redis State Engine');
  console.log('====================================================\n');

  await connectDB();
  const redis = getRedisClient();

  try {
    // --------------------------------------------------------------------------
    // Test 1: Priority Normalization & Legacy Schema Tolerance
    // --------------------------------------------------------------------------
    console.log('[Test 1] Testing Priority Normalizer & Legacy Zod Compatibility...');
    if (normalizePriority('HIGH') !== 'high') throw new Error('normalizePriority("HIGH") failed');
    if (normalizePriority('medium') !== 'medium') throw new Error('normalizePriority("medium") failed');
    if (normalizePriority('LOW') !== 'low') throw new Error('normalizePriority("LOW") failed');
    if (normalizePriority(null) !== 'low') throw new Error('normalizePriority(null) failed');

    // Legacy schema test: skills with .level and extra fields must pass passthrough validation
    const mockLegacyPayload = {
      candidate_context: {
        candidateId: 'cand_123',
        name: 'Legacy Dev',
        email: 'dev@test.com',
        experience: { experienceLevel: 'mid', totalYears: 4, companies: [{ company: 'Corp', years: 4 }] },
        skills: [{ name: 'JavaScript', level: 'Expert', relevantYears: 4, extraCustomProp: true }],
        projects: [{ name: 'Project A', description: 'Desc', technologies: ['Node'], responsibilities: ['Lead'] }],
        claims: [{ text: 'Claim 1', relatedProject: 'Project A' }]
      },
      job_context: {
        job_title: 'Staff Engineer',
        required_skills: ['JavaScript'],
        preferred_skills: ['TypeScript'],
        responsibilities: ['Build stuff'],
        qualifications: ['BS CS'],
        technologies: ['Node.js'],
        experience_requirements: '3+ years'
      },
      assessment_plan: {
        experienceLevel: 'mid',
        totalYears: 4,
        sections: [
          {
            order: 1,
            type: 'intro',
            name: 'Intro Section',
            durationMinutes: 5,
            groups: [{ name: 'Background', baseDifficulty: 'medium', focusAreas: ['Career'] }]
          }
        ]
      },
      interview_state: {
        current_phase: 'intro',
        current_project: '',
        current_group: 'Background',
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
          probesUsed: 0,
          questionsInGroup: 0,
          startedAt: new Date().toISOString(),
          elapsedMs: 0
        },
        consent: true,
        analysis_queue: []
      }
    };

    const parsedLegacy = redisActiveStateSchema.parse(mockLegacyPayload);
    if (!parsedLegacy || parsedLegacy.candidate_context.skills[0].name !== 'JavaScript') {
      throw new Error('Legacy schema parsing failed');
    }
    console.log('✓ Legacy schema tolerance: PASSED');

    // --------------------------------------------------------------------------
    // Test 2: Seed Database for Live State Initialization
    // --------------------------------------------------------------------------
    console.log('\n[Test 2] Seeding MongoDB for RedisStateManager.init()...');
    const testRecruiter = await User.findOneAndUpdate(
      { email: 's1_recruiter@voicehire.com' },
      { name: 'S1 Recruiter', email: 's1_recruiter@voicehire.com', password: 'hash', role: 'RECRUITER' },
      { upsert: true, returnDocument: 'after' }
    );
    const testCandidate = await User.findOneAndUpdate(
      { email: 's1_candidate@voicehire.com' },
      { name: 'S1 Candidate', email: 's1_candidate@voicehire.com', password: 'hash', role: 'CANDIDATE' },
      { upsert: true, returnDocument: 'after' }
    );

    const interview = await Interview.create({
      title: 'S1 State Engine Test Interview',
      recruiterId: testRecruiter._id,
      candidateId: testCandidate._id,
      scheduledAt: new Date(),
      status: 'live',
      experienceLevel: 'mid',
      totalYears: 3.5,
      live: { startedAt: new Date(), consentAt: new Date() }
    });
    const interviewId = interview._id.toString();

    await Resume.create({
      interviewId: interview._id,
      candidateId: testCandidate._id,
      fileName: 'sample_resume.pdf',
      rawText: 'Resume text',
      data: {
        candidate: { name: 'S1 Candidate', email: 's1_candidate@voicehire.com' },
        skills: [{ name: 'Node.js' }, { name: 'Redis' }],
        projects: [
          {
            name: 'Voice Agent',
            description: 'Adaptive speech interviewer',
            technologies: ['Node.js', 'Redis'],
            responsibilities: ['Architecture']
          }
        ],
        claims: [{ text: 'Scaled Redis state machine to 10k concurrent streams', relatedProject: 'Voice Agent' }],
        experienceSummary: { experienceLevel: 'mid', totalYears: 3.5 },
        experience: [{ company: 'VoiceTech Inc', years: 3.5 }]
      }
    });

    await JobDescription.create({
      interviewId: interview._id,
      recruiterId: testRecruiter._id,
      fileName: 'sample_jd.pdf',
      rawText: 'JD text',
      data: {
        job_title: 'Senior Voice Backend Engineer',
        required_skills: ['Node.js', 'Redis'],
        preferred_skills: ['LiveKit', 'WebRTC'],
        responsibilities: ['Build realtime media pipeline'],
        qualifications: ['3+ years Node.js'],
        technologies: ['Node.js', 'Redis', 'LiveKit'],
        experience_requirements: '3+ years'
      }
    });

    await Mapping.create({
      interviewId: interview._id,
      data: {
        matchedSkills: ['Node.js', 'Redis'],
        partialSkills: ['WebRTC'],
        missingSkills: ['LiveKit'],
        projectPriorities: [{ projectName: 'Voice Agent', priority: 'HIGH' }]
      }
    });

    await InterviewPlan.create({
      interviewId: interview._id,
      experienceLevel: 'mid',
      totalYears: 3.5,
      sections: [
        {
          order: 1,
          type: 'introduction',
          title: 'Introduction & Background',
          durationMinutes: 5,
          groups: [{ name: 'Context & Career Overview', baseDifficulty: 'medium', focusAreas: ['career'] }]
        },
        {
          order: 2,
          type: 'project',
          title: 'Voice Agent',
          projectName: 'Voice Agent',
          projectPriority: 'high',
          durationMinutes: 15,
          groups: [
            { name: 'Architecture & Design', baseDifficulty: 'medium', focusAreas: ['topology'] },
            { name: 'Implementation & Technical Trade-offs', baseDifficulty: 'medium', focusAreas: ['concurrency'] },
            { name: 'Edge Cases & Operational Lessons', baseDifficulty: 'medium', focusAreas: ['failover'] }
          ]
        },
        {
          order: 3,
          type: 'remaining_requirements',
          title: 'Remaining Job Requirements',
          durationMinutes: 10,
          groups: [{ name: 'JD Alignment', baseDifficulty: 'medium', focusAreas: ['LiveKit'] }]
        }
      ]
    });

    // --------------------------------------------------------------------------
    // Test 3: Initialize Redis State Engine
    // --------------------------------------------------------------------------
    console.log('\n[Test 3] Calling RedisStateManager.init(interviewId)...');
    const state = await RedisStateManager.init(interviewId);

    if (!state.candidate_context || state.candidate_context.name !== 'S1 Candidate') {
      throw new Error('State candidate_context verification failed');
    }
    if (state.assessment_plan.sections.length !== 3) {
      throw new Error(`Expected 3 sections in assessment_plan, found ${state.assessment_plan.sections.length}`);
    }
    if (state.assessment_plan.sections[1].priority !== 'high') {
      throw new Error(`Expected project priority 'high', found '${state.assessment_plan.sections[1].priority}'`);
    }

    const stateKey = RedisStateManager.getStateKey(interviewId);
    const ttl = await redis.ttl(stateKey);
    console.log(`✓ State initialized in Redis with TTL: ${ttl}s`);
    if (ttl < 20000) throw new Error(`Expected TTL close to 21600s, got ${ttl}`);

    // Idempotency check: second init returns same without wiping
    const state2 = await RedisStateManager.init(interviewId);
    if (state2.candidate_context.name !== 'S1 Candidate') {
      throw new Error('Idempotent init check failed');
    }
    console.log('✓ Idempotent re-initialization: PASSED');

    // --------------------------------------------------------------------------
    // Test 4: Concurrent Patches Under Distributed Lock
    // --------------------------------------------------------------------------
    console.log('\n[Test 4] Testing concurrent patch serialization under lock...');
    const concurrentOps = 5;
    await Promise.all(
      Array.from({ length: concurrentOps }).map((_, i) =>
        RedisStateManager.patch(interviewId, (s) => {
          s.interview_state.progress.elapsedMs += 1000;
          return s;
        })
      )
    );

    const stateAfterConcurrent = await RedisStateManager.get(interviewId);
    console.log(`Final elapsedMs: ${stateAfterConcurrent.interview_state.progress.elapsedMs} (expected ${concurrentOps * 1000})`);
    if (stateAfterConcurrent.interview_state.progress.elapsedMs !== concurrentOps * 1000) {
      throw new Error('Race condition detected: concurrent patches were not properly serialized');
    }
    console.log('✓ Distributed lock patch serialization: PASSED');

    // --------------------------------------------------------------------------
    // Test 5: appendQuestion & appendAnswer (with Mongo write-through)
    // --------------------------------------------------------------------------
    console.log('\n[Test 5] Testing appendQuestion and appendAnswer with Mongo write-through...');
    const q1 = {
      id: 'q_1',
      text: 'Can you describe the system topology of the Voice Agent?',
      section: 2,
      project: 'Voice Agent',
      group: 'Architecture & Design',
      kind: 'main',
      targetRef: { type: 'topic', key: 'topology' },
      askedAt: new Date().toISOString()
    };
    await RedisStateManager.appendQuestion(interviewId, q1);

    const a1 = {
      questionId: 'q_1',
      transcript: 'We structured it with decoupled microservices communicating over Redis Streams.',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 4500,
      status: 'answered',
      analysisStatus: 'done'
    };
    const e1 = [
      {
        id: 'ev_1',
        answerId: 'q_1',
        skill: 'Redis',
        claimRef: 'claim_1',
        project: 'Voice Agent',
        snippet: 'communicating over Redis Streams',
        type: 'technical_depth',
        strength: 2
      }
    ];
    await RedisStateManager.appendAnswer(interviewId, a1, e1);

    // Verify turn in MongoDB
    const turn = await InterviewTurn.findOne({ interviewId: interview._id, seq: 1 });
    if (!turn) throw new Error('InterviewTurn not persisted to MongoDB');
    if (turn.question.text !== q1.text || turn.answer.transcript !== a1.transcript) {
      throw new Error('InterviewTurn data mismatch');
    }
    if (turn.evidence.length !== 1 || turn.evidence[0].skill !== 'Redis') {
      throw new Error('InterviewTurn evidence mismatch');
    }
    console.log('✓ Append turn with MongoDB write-through: PASSED');

    // --------------------------------------------------------------------------
    // Test 6: Recovery when Redis key is deleted
    // --------------------------------------------------------------------------
    console.log('\n[Test 6] Testing automatic state recovery from MongoDB when Redis key is lost...');
    await redis.del(stateKey);
    const keyExists = await redis.exists(stateKey);
    if (keyExists) throw new Error('Key deletion failed');

    // get() should recover from Mongo + InterviewTurn
    const recoveredState = await RedisStateManager.get(interviewId);
    if (!recoveredState) throw new Error('State recovery returned null');
    if (recoveredState.interview_state.answer_history.length !== 1) {
      throw new Error(`Expected 1 recovered answer, found ${recoveredState.interview_state.answer_history.length}`);
    }
    if (recoveredState.interview_state.evidence.length !== 1) {
      throw new Error(`Expected 1 recovered evidence, found ${recoveredState.interview_state.evidence.length}`);
    }
    console.log('✓ Missing key recovery from MongoDB: PASSED');

    // --------------------------------------------------------------------------
    // Test 7: Error handling
    // --------------------------------------------------------------------------
    console.log('\n[Test 7] Testing error handling for invalid interview ID...');
    const fakeId = new mongoose.Types.ObjectId().toString();
    let threw = false;
    try {
      await RedisStateManager.init(fakeId);
    } catch (err) {
      threw = true;
      if (!(err instanceof MissingInterviewDataError)) {
        throw new Error(`Expected MissingInterviewDataError, got ${err.name}`);
      }
    }
    if (!threw) throw new Error('Expected init with non-existent ID to throw');
    console.log('✓ Error handling: PASSED');

    console.log('\n====================================================');
    console.log('ALL STEP S1 TESTS PASSED 100% ✓');
    console.log('====================================================');

    // Clean up test records
    await redis.del(stateKey);
    await InterviewTurn.deleteMany({ interviewId: interview._id });
    await InterviewPlan.deleteMany({ interviewId: interview._id });
    await Mapping.deleteMany({ interviewId: interview._id });
    await JobDescription.deleteMany({ interviewId: interview._id });
    await Resume.deleteMany({ interviewId: interview._id });
    await Interview.deleteMany({ _id: interview._id });
    await User.deleteMany({ email: { $in: ['s1_recruiter@voicehire.com', 's1_candidate@voicehire.com'] } });

    await mongoose.disconnect();
    await closeRedisClient();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ STEP S1 TEST FAILED:', err);
    await closeRedisClient();
    await mongoose.disconnect();
    process.exit(1);
  }
};

runS1Tests();
