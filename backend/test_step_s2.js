import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import { getRedisClient, closeRedisClient } from './src/config/redis.js';
import { Interview } from './src/models/Interview.js';
import { Resume } from './src/models/Resume.js';
import { JobDescription } from './src/models/JobDescription.js';
import { Mapping } from './src/models/Mapping.js';
import { InterviewPlan } from './src/models/InterviewPlan.js';
import { AssessmentReport } from './src/models/AssessmentReport.js';
import { User } from './src/models/User.js';

const runS2Tests = async () => {
  console.log('====================================================');
  console.log('STEP S2 TEST SUITE: Routes & Models Gate Checks');
  console.log('====================================================\n');

  await connectDB();
  const redis = getRedisClient();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5002, resolve));
  const baseUrl = 'http://127.0.0.1:5002';

  const req = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  try {
    // --------------------------------------------------------------------------
    // 1. Setup Test Users
    // --------------------------------------------------------------------------
    console.log('[1] Setting up Recruiter, Candidate, and Stranger accounts...');
    await User.deleteMany({
      email: { $in: ['s2_recruiter@voicehire.com', 's2_candidate@voicehire.com', 's2_stranger@voicehire.com'] }
    });

    const rRecruiter = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'S2 Recruiter', email: 's2_recruiter@voicehire.com', password: 'password123', role: 'RECRUITER' }
    });
    const recruiterToken = rRecruiter.data.token;
    const recruiterUser = rRecruiter.data.user;

    const rCandidate = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'S2 Candidate', email: 's2_candidate@voicehire.com', password: 'password123', role: 'CANDIDATE' }
    });
    const candidateToken = rCandidate.data.token;
    const candidateUser = rCandidate.data.user;

    const rStranger = await req('/api/auth/register', {
      method: 'POST',
      body: { name: 'S2 Stranger', email: 's2_stranger@voicehire.com', password: 'password123', role: 'CANDIDATE' }
    });
    const strangerToken = rStranger.data.token;

    // --------------------------------------------------------------------------
    // 2. Create Interview Shell & Seed Prerequisite Docs
    // --------------------------------------------------------------------------
    console.log('\n[2] Creating and seeding test interview in "scheduled" status...');
    const interview = await Interview.create({
      title: 'Phase 3 Live Route Verification Interview',
      recruiterId: recruiterUser._id,
      candidateId: candidateUser._id,
      scheduledAt: new Date(Date.now() + 3600000),
      status: 'scheduled',
      experienceLevel: 'mid',
      totalYears: 3.5,
      live: {}
    });
    const interviewId = interview._id.toString();

    await Resume.create({
      interviewId: interview._id,
      candidateId: candidateUser._id,
      fileName: 's2_resume.pdf',
      data: {
        candidate: { name: 'S2 Candidate', email: 's2_candidate@voicehire.com' },
        skills: [{ name: 'Node.js' }, { name: 'LiveKit' }],
        projects: [{ name: 'Realtime Voice', technologies: ['Node.js'], responsibilities: ['Core'] }],
        claims: [{ text: 'Built audio pipeline', relatedProject: 'Realtime Voice' }],
        experienceSummary: { experienceLevel: 'mid', totalYears: 3.5 },
        experience: [{ company: 'Voice AI Corp', years: 3.5 }]
      }
    });

    await JobDescription.create({
      interviewId: interview._id,
      recruiterId: recruiterUser._id,
      fileName: 's2_jd.pdf',
      data: {
        job_title: 'Full Stack Realtime Engineer',
        required_skills: ['Node.js', 'LiveKit'],
        preferred_skills: ['WebRTC']
      }
    });

    await Mapping.create({
      interviewId: interview._id,
      data: {
        matchedSkills: ['Node.js', 'LiveKit'],
        partialSkills: [],
        missingSkills: ['WebRTC'],
        projectPriorities: [{ projectName: 'Realtime Voice', priority: 'HIGH' }]
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
          groups: [{ name: 'Overview', baseDifficulty: 'medium', focusAreas: ['Background'] }]
        },
        {
          order: 2,
          type: 'project',
          title: 'Realtime Voice',
          projectName: 'Realtime Voice',
          projectPriority: 'high',
          durationMinutes: 15,
          groups: [
            { name: 'Architecture & Design', baseDifficulty: 'medium', focusAreas: ['audio streaming'] },
            { name: 'Implementation & Technical Trade-offs', baseDifficulty: 'medium', focusAreas: ['latency'] },
            { name: 'Edge Cases & Operational Lessons', baseDifficulty: 'medium', focusAreas: ['packet loss'] }
          ]
        },
        {
          order: 3,
          type: 'remaining_requirements',
          title: 'Remaining Job Requirements',
          durationMinutes: 10,
          groups: [{ name: 'JD Alignment', baseDifficulty: 'medium', focusAreas: ['WebRTC'] }]
        }
      ]
    });

    // --------------------------------------------------------------------------
    // 3. Gate Check: Ownership Verification
    // --------------------------------------------------------------------------
    console.log('\n[3] Gate Check: Stranger access rejection...');
    const rStrangerAccess = await req(`/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${strangerToken}` }
    });
    console.log(`Stranger access status: ${rStrangerAccess.status} (${rStrangerAccess.data.code})`);
    if (rStrangerAccess.status !== 403 || rStrangerAccess.data.code !== 'FORBIDDEN') {
      throw new Error('Ownership guard failed: stranger was not rejected with 403 FORBIDDEN');
    }
    console.log('✓ Ownership guard: PASSED');

    // --------------------------------------------------------------------------
    // 4. Gate Check: Early Token Rejection (Status = scheduled)
    // --------------------------------------------------------------------------
    console.log('\n[4] Gate Check: Early token request before recruiter readiness...');
    const rEarlyToken = await req(`/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log(`Early token response: ${rEarlyToken.status} (${rEarlyToken.data.code})`);
    if (rEarlyToken.status !== 400 || rEarlyToken.data.code !== 'INTERVIEW_NOT_READY') {
      throw new Error('Early token gate failed: expected 400 INTERVIEW_NOT_READY');
    }
    console.log('✓ Early token rejection: PASSED');

    // Mark recruiter ready
    interview.status = 'recruiter_ready';
    interview.recruiterReady = true;
    await interview.save();

    // --------------------------------------------------------------------------
    // 5. Gate Check: Consent Requirement (403 CONSENT_REQUIRED)
    // --------------------------------------------------------------------------
    console.log('\n[5] Gate Check: Candidate token request without prior consent...');
    const rNoConsentToken = await req(`/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log(`No-consent token response: ${rNoConsentToken.status} (${rNoConsentToken.data.code})`);
    if (rNoConsentToken.status !== 403 || rNoConsentToken.data.code !== 'CONSENT_REQUIRED') {
      throw new Error('Consent gate failed: expected 403 CONSENT_REQUIRED');
    }
    console.log('✓ Consent requirement check: PASSED');

    // Record candidate consent
    console.log('\n[5b] Candidate records consent...');
    const rConsent = await req(`/api/interviews/${interviewId}/consent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    if (rConsent.status !== 200 || !rConsent.data.consentAt) {
      throw new Error('Consent endpoint failed');
    }
    console.log('✓ Candidate consent recorded successfully');

    // --------------------------------------------------------------------------
    // 6. Gate Check: Token Generation & Grant Verification (CAND vs REC)
    // --------------------------------------------------------------------------
    console.log('\n[6] Gate Check: LiveKit token issuance & grant validation...');

    // Candidate token
    const rCandToken = await req(`/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    if (rCandToken.status !== 200 || !rCandToken.data.token) {
      throw new Error('Candidate token issuance failed');
    }
    // Verify secrets are NOT leaked in response
    if (rCandToken.data.apiSecret || rCandToken.data.LIVEKIT_API_SECRET) {
      throw new Error('SECURITY VIOLATION: LiveKit secret was exposed in token response!');
    }

    const decodedCandToken = jwt.decode(rCandToken.data.token);
    console.log('Candidate token grants:', decodedCandToken?.video);
    if (!decodedCandToken?.video?.canPublish || !decodedCandToken?.video?.canSubscribe) {
      throw new Error('Candidate token missing publish or subscribe grant');
    }

    // Recruiter token (Observer)
    const rRecToken = await req(`/api/interviews/${interviewId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    if (rRecToken.status !== 200 || !rRecToken.data.token) {
      throw new Error('Recruiter token issuance failed');
    }
    const decodedRecToken = jwt.decode(rRecToken.data.token);
    console.log('Recruiter observer token grants:', decodedRecToken?.video);
    if (decodedRecToken?.video?.canPublish === true) {
      throw new Error('Recruiter observer token must NOT have canPublish: true!');
    }
    if (!decodedRecToken?.video?.canSubscribe) {
      throw new Error('Recruiter observer token missing canSubscribe grant');
    }
    console.log('✓ Token generation, observer grants, and secret protection: PASSED');

    // --------------------------------------------------------------------------
    // 7. Gate Check: POST /api/interviews/:id/start Idempotency
    // --------------------------------------------------------------------------
    console.log('\n[7] Gate Check: POST /start endpoint idempotency...');
    const rStart1 = await req(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log(`First /start call response: status ${rStart1.status}, interview status: ${rStart1.data.status}`);
    if (rStart1.status !== 200 || rStart1.data.status !== 'live' || !rStart1.data.state) {
      throw new Error('/start first invocation failed');
    }

    const rStart2 = await req(`/api/interviews/${interviewId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log(`Second /start call response: status ${rStart2.status}, alreadyStarted: ${rStart2.data.alreadyStarted}`);
    if (rStart2.status !== 200 || !rStart2.data.alreadyStarted) {
      throw new Error('/start second invocation was not idempotent');
    }
    console.log('✓ /start endpoint idempotency: PASSED');

    // --------------------------------------------------------------------------
    // 8. Gate Check: GET /api/interviews/:id/live-state (Recruiter Only & Sanitized)
    // --------------------------------------------------------------------------
    console.log('\n[8] Gate Check: Live-state polling and sanitization...');
    const rCandLiveState = await req(`/api/interviews/${interviewId}/live-state`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    if (rCandLiveState.status !== 403) {
      throw new Error('Candidate was able to access recruiter live-state (expected 403)');
    }

    const rRecLiveState = await req(`/api/interviews/${interviewId}/live-state`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    if (rRecLiveState.status !== 200 || !rRecLiveState.data.liveState) {
      throw new Error('Recruiter live-state fetch failed');
    }
    const ls = rRecLiveState.data.liveState;
    if (typeof ls.phase !== 'string' || typeof ls.status !== 'string' || ls.error !== false) {
      throw new Error('Sanitized liveState format mismatch');
    }
    console.log('✓ Live-state guard and sanitization: PASSED');

    // --------------------------------------------------------------------------
    // 9. Gate Check: Report 404 Guard & Completion Finalization
    // --------------------------------------------------------------------------
    console.log('\n[9] Gate Check: Report 404 before completion...');
    const rReportBeforeEnd = await req(`/api/interviews/${interviewId}/report`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log(`Report before end status: ${rReportBeforeEnd.status} (${rReportBeforeEnd.data.code})`);
    if (rReportBeforeEnd.status !== 404 || rReportBeforeEnd.data.code !== 'REPORT_NOT_FOUND') {
      throw new Error('Report endpoint must return 404 until interview is completed');
    }
    console.log('✓ Report 404 guard before completion: PASSED');

    // End interview
    console.log('\n[9b] Ending interview (idempotent test)...');
    const rEnd1 = await req(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    if (rEnd1.status !== 200 || rEnd1.data.status !== 'completed' || rEnd1.data.endedBy !== 'candidate') {
      throw new Error('/end first call failed');
    }

    const rEnd2 = await req(`/api/interviews/${interviewId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    if (rEnd2.status !== 200 || !rEnd2.data.alreadyEnded) {
      throw new Error('/end second call was not idempotent');
    }
    console.log('✓ /end endpoint idempotency: PASSED');

    // Seed mock completed assessment report to test /report fetch
    await AssessmentReport.create({
      interviewId: interview._id,
      candidateId: candidateUser._id,
      summaryText: 'Candidate demonstrated strong Node.js knowledge.',
      status: 'completed',
      coverage: { sectionsDone: 3, groupsDone: 5 },
      durationMs: 1800000,
      endedBy: 'candidate'
    });

    const rReportAfterEnd = await req(`/api/interviews/${interviewId}/report`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    if (rReportAfterEnd.status !== 200 || !rReportAfterEnd.data.report) {
      throw new Error('Report fetch after completion failed');
    }
    console.log('✓ Report fetch after completion: PASSED');

    console.log('\n====================================================');
    console.log('ALL STEP S2 TESTS PASSED 100% ✓');
    console.log('====================================================');

    // Clean up test data
    await redis.del(`interview:state:${interviewId}`);
    await AssessmentReport.deleteMany({ interviewId: interview._id });
    await InterviewPlan.deleteMany({ interviewId: interview._id });
    await Mapping.deleteMany({ interviewId: interview._id });
    await JobDescription.deleteMany({ interviewId: interview._id });
    await Resume.deleteMany({ interviewId: interview._id });
    await Interview.deleteMany({ _id: interview._id });
    await User.deleteMany({ email: { $in: ['s2_recruiter@voicehire.com', 's2_candidate@voicehire.com', 's2_stranger@voicehire.com'] } });

    server.close();
    await closeRedisClient();
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ STEP S2 TEST FAILED:', err);
    server.close();
    await closeRedisClient();
    await mongoose.disconnect();
    process.exit(1);
  }
};

runS2Tests();
