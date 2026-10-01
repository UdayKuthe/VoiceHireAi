import http from 'http';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import User from './src/models/User.js';
import Interview from './src/models/Interview.js';

const runTests = async () => {
  await connectDB();

  // Clean test accounts if present
  await User.deleteMany({ email: { $in: ['test_recruiter@voicehire.com', 'test_candidate@voicehire.com'] } });
  await Interview.deleteMany({ title: { $regex: /^Test Phase 1/ } });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5001, resolve));
  const baseUrl = 'http://127.0.0.1:5001';

  console.log('\n--- STARTING PHASE 1 SMOKE TESTS ---');

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
    // 1. Register Recruiter
    console.log('\n[1] Register Recruiter');
    const r1 = await req('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Test Recruiter',
        email: 'test_recruiter@voicehire.com',
        password: 'password123',
        role: 'RECRUITER'
      }
    });
    console.log('Result:', r1.status, r1.data.user?.email, 'Role:', r1.data.user?.role);
    if (r1.status !== 201 || !r1.data.token) throw new Error('Recruiter registration failed');
    const recruiterToken = r1.data.token;

    // 2. Register Candidate
    console.log('\n[2] Register Candidate');
    const r2 = await req('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Test Candidate',
        email: 'test_candidate@voicehire.com',
        password: 'password123',
        role: 'CANDIDATE'
      }
    });
    console.log('Result:', r2.status, r2.data.user?.email, 'Role:', r2.data.user?.role);
    if (r2.status !== 201 || !r2.data.token) throw new Error('Candidate registration failed');
    const candidateToken = r2.data.token;
    const candidateId = r2.data.user._id;

    // 3. Test Cross-Role Security Checks
    console.log('\n[3] Test Cross-Role Security Isolation');
    const rCross1 = await req('/api/candidates', {
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log('Candidate attempting recruiter route /api/candidates:', rCross1.status, rCross1.data.error);
    if (rCross1.status !== 403) throw new Error('Security flaw: Candidate was not forbidden from recruiter route');

    const rCross2 = await req('/api/candidate/interviews', {
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Recruiter attempting candidate route /api/candidate/interviews:', rCross2.status, rCross2.data.error);
    if (rCross2.status !== 403) throw new Error('Security flaw: Recruiter was not forbidden from candidate route');

    // 4. Recruiter fetches candidate list
    console.log('\n[4] Recruiter fetches candidates');
    const rCandidates = await req('/api/candidates', {
      headers: { Authorization: `Bearer ${recruiterToken}` }
    });
    console.log('Candidates found:', rCandidates.data.candidates?.length);
    if (rCandidates.status !== 200 || !rCandidates.data.candidates.some((c) => c.email === 'test_candidate@voicehire.com')) {
      throw new Error('Candidate list retrieval failed');
    }

    // 5. Recruiter schedules an interview
    console.log('\n[5] Recruiter schedules interview');
    const rCreate = await req('/api/interviews', {
      method: 'POST',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: {
        title: 'Test Phase 1 Interview Session',
        candidateId,
        scheduledAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes from now (trigger reminder)
      }
    });
    console.log('Created interview status:', rCreate.status, rCreate.data.interview?.status);
    if (rCreate.status !== 201) throw new Error('Interview creation failed');
    const interviewId = rCreate.data.interview._id;

    // 6. Candidate views upcoming interview and attempts to join BEFORE recruiter is ready
    console.log('\n[6] Candidate attempts early join before recruiter is ready');
    const rEarlyJoin = await req(`/api/candidate/interviews/${interviewId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log('Early join response:', rEarlyJoin.status, rEarlyJoin.data.error);
    if (rEarlyJoin.status !== 400 || !rEarlyJoin.data.error.includes('recruiter has not marked')) {
      throw new Error('Validation flaw: Candidate was allowed to join before recruiter readiness');
    }

    // 7. Recruiter marks Ready
    console.log('\n[7] Recruiter marks Ready');
    const rReady = await req(`/api/interviews/${interviewId}/ready`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: { ready: true }
    });
    console.log('Readiness response status:', rReady.data.interview?.status, 'recruiterReady:', rReady.data.interview?.recruiterReady);
    if (rReady.status !== 200 || !rReady.data.interview?.recruiterReady) {
      throw new Error('Failed to mark recruiter ready');
    }

    // 8. Candidate joins interview (now permitted -> transitions to live)
    console.log('\n[8] Candidate joins interview');
    const rJoin = await req(`/api/candidate/interviews/${interviewId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    console.log('Join response status:', rJoin.data.interview?.status, 'candidateReady:', rJoin.data.interview?.candidateReady);
    if (rJoin.status !== 200 || rJoin.data.interview?.status !== 'live') {
      throw new Error('Interview did not transition to live upon candidate join');
    }

    // 9. Recruiter completes the interview
    console.log('\n[9] Recruiter completes interview');
    const rComplete = await req(`/api/interviews/${interviewId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: { status: 'completed' }
    });
    console.log('Complete response:', rComplete.data.interview?.status);
    if (rComplete.status !== 200 || rComplete.data.interview?.status !== 'completed') {
      throw new Error('Failed to complete interview');
    }

    // 10. Rejection of invalid transitions (e.g. cancelling a completed interview)
    console.log('\n[10] Verify invalid transition rejection');
    const rInvalid = await req(`/api/interviews/${interviewId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${recruiterToken}` },
      body: { status: 'cancelled' }
    });
    console.log('Invalid transition status:', rInvalid.status, rInvalid.data.error);
    if (rInvalid.status !== 400) {
      throw new Error('Server accepted an invalid state transition');
    }

    // 11. Password Reset Flow
    console.log('\n[11] Test Password Reset');
    const rForgot = await req('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'test_candidate@voicehire.com' }
    });
    console.log('Forgot password response:', rForgot.data.message);

    // Retrieve generated token from DB to test reset
    const userWithToken = await User.findOne({ email: 'test_candidate@voicehire.com' }).select('+resetToken');
    if (!userWithToken?.resetToken) throw new Error('Reset token was not saved');

    const rReset = await req('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: userWithToken.resetToken,
        newPassword: 'newpassword456'
      }
    });
    console.log('Reset response:', rReset.data.message);

    // Verify login with new password
    const rNewLogin = await req('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'test_candidate@voicehire.com',
        password: 'newpassword456'
      }
    });
    console.log('Login with new password status:', rNewLogin.status, 'user:', rNewLogin.data.user?.email);
    if (rNewLogin.status !== 200) throw new Error('Login with new password failed');

    console.log('\n========================================');
    console.log('ALL PHASE 1 SMOKE TESTS PASSED 100%!');
    console.log('========================================\n');
  } finally {
    // Cleanup
    await User.deleteMany({ email: { $in: ['test_recruiter@voicehire.com', 'test_candidate@voicehire.com'] } });
    await Interview.deleteMany({ title: { $regex: /^Test Phase 1/ } });
    server.close();
    process.exit(0);
  }
};

runTests().catch((err) => {
  console.error('\nTEST RUN FAILED:', err);
  process.exit(1);
});
