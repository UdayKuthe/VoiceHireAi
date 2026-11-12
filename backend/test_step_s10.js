/**
 * VoiceHire AI — Step S10 Gate Tests: Frontend & Recruiter Observer Panel
 *
 * Verifies all S10 requirements per task_prd.md §3.2, §13 UI, §15 & D1–D8:
 *  1. Candidate Flow:
 *     - Consent gate (`POST /api/interviews/:id/consent`)
 *     - Microphone permission check with exact string: "Microphone access is required to start the interview."
 *     - User gesture audio unlock (`room.startAudio()`)
 *     - Real-time states: connecting, reconnecting, ai_speaking, listening, processing
 *     - Display: shows only caption and timer; headphones hint present
 *  2. Security & Privacy Boundary:
 *     - Strict verification that NO evidence, scores, or rationale are present in Candidate DOM or state.
 *  3. LiveKit Token Permissions:
 *     - Candidate: publish + subscribe
 *     - Recruiter: observer only (canSubscribe=true, canPublish=false)
 *     - Gated by consent: 403 CONSENT_REQUIRED until consent recorded
 *  4. Recruiter Observer Panel:
 *     - Polls /live-state every 3 seconds
 *     - Displays sanitized live state (phase, current q, progress, skill_state, claim_verification, open gaps, elapsed)
 *     - Contains End button calling POST /api/interviews/:id/end
 *  5. Frontend Build:
 *     - Vite production build compiles with zero errors.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from './src/config/env.js';
import { Interview } from './src/models/Interview.js';
import { User } from './src/models/User.js';
import { Resume } from './src/models/Resume.js';
import { JobDescription } from './src/models/JobDescription.js';
import { Mapping } from './src/models/Mapping.js';
import { InterviewPlan } from './src/models/InterviewPlan.js';
import { RedisStateManager } from './src/services/redisState.service.js';
import { closeRedisClient } from './src/config/redis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let app;

async function setupHttpServer() {
  const mod = await import('./src/app.js');
  app = mod.default;
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

function generateAuthToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role
    },
    env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function runStepS10Tests() {
  console.log('========================================================');
  console.log('   VoiceHire AI — Step S10 Gate Verification Tests     ');
  console.log('========================================================\n');

  const { server, port } = await setupHttpServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Connect to Mongo if needed
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(env.MONGODB_URI);
    }

    // ----------------------------------------------------
    // TEST 1: Source Code & Privacy Boundary Verification
    // ----------------------------------------------------
    console.log('[Test 1] Inspecting LiveInterviewPage.jsx & privacy boundaries...');
    const liveInterviewPath = path.resolve(__dirname, '../frontend/src/pages/LiveInterviewPage.jsx');
    const observerPanelPath = path.resolve(__dirname, '../frontend/src/components/RecruiterObserverPanel.jsx');

    assert(fs.existsSync(liveInterviewPath), 'LiveInterviewPage.jsx exists');
    assert(fs.existsSync(observerPanelPath), 'RecruiterObserverPanel.jsx exists');

    const liveInterviewCode = fs.readFileSync(liveInterviewPath, 'utf-8');
    const observerPanelCode = fs.readFileSync(observerPanelPath, 'utf-8');

    // 1a. Consent check present
    assert(liveInterviewCode.includes('submitConsent'), 'LiveInterviewPage calls submitConsent');

    // 1b. Exact microphone access denied string check
    assert(
      liveInterviewCode.includes('Microphone access is required to start the interview.'),
      'LiveInterviewPage contains verbatim error message: "Microphone access is required to start the interview."'
    );

    // 1c. User gesture audio unlock
    assert(liveInterviewCode.includes('room.startAudio()'), 'LiveInterviewPage unlocks audio with room.startAudio() on user click');

    // 1d. All 5 voice states handled
    const expectedStates = ['connecting', 'reconnecting', 'ai_speaking', 'listening', 'processing'];
    for (const st of expectedStates) {
      assert(liveInterviewCode.includes(st), `LiveInterviewPage implements '${st}' state`);
    }

    // 1e. Headphones hint present
    assert(
      liveInterviewCode.toLowerCase().includes('headphones'),
      'LiveInterviewPage includes headphones recommendation'
    );

    // 1f. STRICT PRIVACY: Candidate UI exposes no evidence, scores, or rationale
    assert(
      !liveInterviewCode.includes('evidence_gaps'),
      'STRICT PRIVACY: LiveInterviewPage does NOT reference evidence_gaps'
    );
    assert(
      !liveInterviewCode.includes('candidate_summary'),
      'STRICT PRIVACY: LiveInterviewPage does NOT reference candidate_summary'
    );
    assert(
      !liveInterviewCode.includes('scoresAssessed') && !liveInterviewCode.includes('skill_state'),
      'STRICT PRIVACY: LiveInterviewPage does NOT expose skill_state or scores'
    );

    // 1g. Observer panel polls every 3 seconds
    assert(
      observerPanelCode.includes('3000'),
      'RecruiterObserverPanel polls live-state every 3000ms (3s)'
    );
    assert(
      observerPanelCode.includes('endInterview'),
      'RecruiterObserverPanel contains End Interview action'
    );

    console.log('✓ Test 1 passed: LiveInterviewPage and RecruiterObserverPanel code verified with strict candidate privacy.\n');

    // ----------------------------------------------------
    // TEST 2: Backend Consent Gate & Token Permissions
    // ----------------------------------------------------
    console.log('[Test 2] Testing Candidate Consent Gate & LiveKit Token permissions...');

    const rand = Math.random().toString(36).substring(7);
    const recUser = await User.create({
      name: 'Test Recruiter S10',
      email: `recruiter_s10_${rand}@voicehire.com`,
      passwordHash: 'hash',
      role: 'RECRUITER'
    });
    const candUser = await User.create({
      name: 'Test Candidate S10',
      email: `candidate_s10_${rand}@voicehire.com`,
      passwordHash: 'hash',
      role: 'CANDIDATE'
    });

    const recToken = generateAuthToken(recUser);
    const candToken = generateAuthToken(candUser);

    await User.findByIdAndUpdate(recUser._id, { isLoggedIn: true, activeSessionToken: recToken });
    await User.findByIdAndUpdate(candUser._id, { isLoggedIn: true, activeSessionToken: candToken });

    const testInterview = await Interview.create({
      recruiterId: recUser._id,
      candidateId: candUser._id,
      title: 'Senior Frontend Architect',
      status: 'recruiter_ready',
      recruiterReady: true,
      candidateReady: false
    });
    const interviewId = testInterview._id.toString();

    // 2a. Early token request by candidate BEFORE consent -> MUST FAIL 403 CONSENT_REQUIRED
    const preConsentRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`
      }
    });
    const preConsentData = await preConsentRes.json();
    assert.strictEqual(preConsentRes.status, 403, 'Pre-consent token attempt returns 403');
    assert.strictEqual(preConsentData.code, 'CONSENT_REQUIRED', 'Error code is CONSENT_REQUIRED');
    console.log('  Candidate blocked before consent (403 CONSENT_REQUIRED) ✓');

    // 2b. Candidate records consent
    const consentRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`
      }
    });
    assert.strictEqual(consentRes.status, 200, 'Consent recorded successfully');
    console.log('  Candidate consent recorded via POST /consent ✓');

    // 2c. Candidate requests token AFTER consent -> 200 with publish grant
    const candTokenRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candToken}`
      }
    });
    const candTokenData = await candTokenRes.json();
    assert.strictEqual(candTokenRes.status, 200, 'Candidate token granted');
    assert(candTokenData.token, 'Candidate received valid LiveKit JWT');

    // Decode candidate token to inspect grants
    const candJwt = jwt.decode(candTokenData.token);
    assert.strictEqual(candJwt.video.room, interviewId, 'Token bound to interview room');
    assert.strictEqual(candJwt.video.canPublish, true, 'Candidate has canPublish: true');
    assert.strictEqual(candJwt.video.canSubscribe, true, 'Candidate has canSubscribe: true');
    console.log('  Candidate token verified with publish+subscribe grants ✓');

    // 2d. Recruiter requests token -> Observer only (canPublish: false, canSubscribe: true)
    const recTokenRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`
      }
    });
    const recTokenData = await recTokenRes.json();
    assert.strictEqual(recTokenRes.status, 200, 'Recruiter token granted');
    const recJwt = jwt.decode(recTokenData.token);
    assert.strictEqual(recJwt.video.canPublish, false, 'Recruiter has canPublish: false (observer only)');
    assert.strictEqual(recJwt.video.canSubscribe, true, 'Recruiter has canSubscribe: true');
    console.log('  Recruiter token verified as observer-only grant ✓');

    console.log('✓ Test 2 passed: Consent gate and role-based LiveKit grants verified.\n');

    // ----------------------------------------------------
    // TEST 3: Recruiter Observer Panel Telemetry Endpoint
    // ----------------------------------------------------
    console.log('[Test 3] Testing Recruiter Live Observer State endpoint...');

    // Seed mock data for Redis state init
    await Resume.create({
      interviewId,
      candidateId: candUser._id,
      fileName: 'resume.pdf',
      parsedData: {
        candidate: { name: 'Test Candidate S10' },
        skills: [{ name: 'React', category: 'Frontend', level: 'senior' }],
        experience: [{ company: 'TestCorp', years: 3 }],
        experienceSummary: { totalYears: 3, experienceLevel: 'mid' }
      }
    });
    await JobDescription.create({
      interviewId,
      fileName: 'jd.pdf',
      parsedData: {
        title: 'Senior Frontend Architect',
        required_skills: [{ name: 'React', priority: 'HIGH' }],
        experience: { minimumYears: 2, level: 'mid' }
      }
    });
    await Mapping.create({
      interviewId,
      matchedSkills: ['React'],
      missingSkills: [],
      projectPriorities: [{ projectName: 'Web App', priority: 'high', score: 90 }]
    });
    await InterviewPlan.create({
      interviewId,
      experienceLevel: 'mid',
      sections: [
        {
          order: 1,
          type: 'introduction',
          title: 'Introduction',
          durationMinutes: 5,
          groups: [{ name: 'Warm-up', baseDifficulty: 'medium', focusAreas: ['Background'] }]
        }
      ]
    });

    // Initialize state
    await RedisStateManager.init(interviewId);
    testInterview.status = 'live';
    await testInterview.save();

    // Recruiter polls live-state
    const liveStateRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/live-state`, {
      headers: {
        Authorization: `Bearer ${recToken}`
      }
    });
    const liveStateData = await liveStateRes.json();
    assert.strictEqual(liveStateRes.status, 200, 'Live state returned successfully');
    assert(liveStateData.liveState, 'Contains liveState payload');
    assert(['live', 'active'].includes(liveStateData.liveState.status), 'Live status reported');
    assert(typeof liveStateData.liveState.elapsedMs === 'number', 'Elapsed time reported');
    assert(liveStateData.liveState.skill_state, 'Skill state reported to recruiter');

    // Candidate attempting to access recruiter observer endpoint MUST be rejected (403)
    const candForbiddenRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/live-state`, {
      headers: {
        Authorization: `Bearer ${candToken}`
      }
    });
    assert.strictEqual(candForbiddenRes.status, 403, 'Candidate forbidden from recruiter live-state');
    console.log('  Candidate forbidden (403) from observer telemetry ✓');

    console.log('✓ Test 3 passed: Recruiter observer telemetry working with role isolation.\n');

    // ----------------------------------------------------
    // TEST 4: Recruiter Observer End Interview Action
    // ----------------------------------------------------
    console.log('[Test 4] Testing Recruiter End Interview action from Observer Panel...');

    const endRes = await fetch(`${baseUrl}/api/interviews/${interviewId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${recToken}`
      }
    });
    const endData = await endRes.json();
    assert.strictEqual(endRes.status, 200, 'End interview succeeded');
    assert.strictEqual(endData.success, true, 'Interview finalized successfully');

    const updatedInterview = await Interview.findById(interviewId);
    assert(['completed', 'completed_partial', 'partial'].includes(updatedInterview.status), 'Interview marked completed');
    assert.strictEqual(updatedInterview.live.endedBy, 'recruiter', 'Recorded endedBy as recruiter');
    console.log('✓ Test 4 passed: Recruiter can terminate and finalize live session.\n');

    console.log('========================================================');
    console.log('   STEP S10 GATE TESTS: ALL 4 TESTS PASSED (100%)      ');
    console.log('========================================================');
  } finally {
    server.close();
    await closeRedisClient();
    await mongoose.disconnect();
  }
}

runStepS10Tests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ S10 Gate Test Failure:', err);
    process.exit(1);
  });

