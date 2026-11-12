import mongoose from 'mongoose';
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { Interview } from '../models/Interview.js';
import { AssessmentReport } from '../models/AssessmentReport.js';
import { RedisStateManager } from '../services/redisState.service.js';
import { finalizeInterview } from '../services/finalizeInterview.service.js';
import { createOrGetVoiceSession, disposeVoiceSession } from '../services/voice/voiceSession.js';
import { computeRecommendation } from '../services/evaluationRecommendation.service.js';

/**
 * Middleware: Verifies interview existence and user ownership
 */
export const verifyInterviewOwnership = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid ID',
        code: 'INVALID_INTERVIEW_ID',
        message: 'The provided interview ID format is invalid.'
      });
    }

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({
        error: 'Not Found',
        code: 'INTERVIEW_NOT_FOUND',
        message: 'The requested interview does not exist.'
      });
    }

    const userIdStr = req.user._id.toString();
    const isCandidate = req.user.role === 'CANDIDATE';
    const isRecruiter = req.user.role === 'RECRUITER';

    if (isCandidate && interview.candidateId.toString() !== userIdStr) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'You do not have access to this candidate interview.'
      });
    }

    if (isRecruiter && interview.recruiterId.toString() !== userIdStr) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'You do not have recruiter authorization for this interview.'
      });
    }

    req.interview = interview;
    next();
  } catch (err) {
    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'SERVER_ERROR',
      message: err.message
    });
  }
};

/**
 * POST /api/interviews/:id/token
 */
export const issueLiveKitToken = async (req, res) => {
  try {
    const interview = req.interview;
    const isCandidate = req.user.role === 'CANDIDATE';

    // 1. Status Check: Must be in recruiter_ready, live, or paused
    const allowedStatuses = ['recruiter_ready', 'live', 'paused'];
    if (!allowedStatuses.includes(interview.status)) {
      return res.status(400).json({
        error: 'Interview Not Ready',
        code: 'INTERVIEW_NOT_READY',
        message: 'Cannot join audio room: The recruiter has not marked readiness or the interview is not active.'
      });
    }

    // 2. Consent Check for Candidate
    if (isCandidate && !interview.live?.consentAt) {
      return res.status(403).json({
        error: 'Consent Required',
        code: 'CONSENT_REQUIRED',
        message: 'Candidate consent is required before generating an interview token.'
      });
    }

    // 3. Issue LiveKit Token with 2h TTL
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.user._id.toString(),
      name: req.user.name || (isCandidate ? 'Candidate' : 'Recruiter'),
      ttl: 2 * 60 * 60, // 2 hours
      metadata: JSON.stringify({
        name: req.user.name,
        role: req.user.role
      })
    });

    const roomName = interview._id.toString();

    // Grants: Candidate publishes+subscribes, Recruiter is observer (canSubscribe only)
    if (isCandidate) {
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });
    } else {
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: false,
        canSubscribe: true,
        canPublishData: false
      });
    }

    const token = await at.toJwt();

    return res.status(200).json({
      success: true,
      token,
      url: env.LIVEKIT_URL
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Token Generation Failed',
      code: 'TOKEN_ERROR',
      message: err.message
    });
  }
};

/**
 * POST /api/interviews/:id/consent
 */
export const recordConsent = async (req, res) => {
  try {
    const interview = req.interview;
    if (req.user.role !== 'CANDIDATE') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'Consent can only be granted by the candidate.'
      });
    }

    interview.live = interview.live || {};
    interview.live.consentAt = new Date();
    await interview.save();

    // Sync to Redis state if active
    try {
      await RedisStateManager.patch(interview._id.toString(), (state) => {
        state.interview_state.consent = true;
        return state;
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Candidate consent recorded successfully.',
      consentAt: interview.live.consentAt
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Consent Error',
      code: 'CONSENT_ERROR',
      message: err.message
    });
  }
};

/**
 * POST /api/interviews/:id/start
 */
export const startLiveInterview = async (req, res) => {
  try {
    const interview = req.interview;
    const interviewId = interview._id.toString();

    // Status check
    const allowedStatuses = ['recruiter_ready', 'live', 'paused'];
    if (!allowedStatuses.includes(interview.status)) {
      return res.status(400).json({
        error: 'Interview Not Ready',
        code: 'INTERVIEW_NOT_READY',
        message: 'Cannot start interview: Status must be recruiter_ready, live, or paused.'
      });
    }

    // Ensure the in-process AI Interviewer bot participant is active in the LiveKit room
    const voiceSession = await createOrGetVoiceSession(interviewId);
    if (!voiceSession.room || voiceSession.isDisposed || voiceSession.room.state !== 'connected') {
      voiceSession.start().catch((err) => {
        console.warn(`[startLiveInterview] Voice session startup notice: ${err.message}`);
      });
    }

    // Idempotency: if already live and state exists, return existing session and state
    if (interview.status === 'live') {
      const existingState = await RedisStateManager.get(interviewId);
      if (existingState) {
        // Return existing without recreating bot or regenerating questions (§16)
        return res.status(200).json({
          success: true,
          status: 'live',
          alreadyStarted: true,
          state: existingState,
          botStarted: true
        });
      }
    }

    // Initialize Redis state
    const state = await RedisStateManager.init(interviewId);

    // Update MongoDB interview status and live metadata
    interview.status = 'live';
    interview.live = interview.live || {};
    if (!interview.live.startedAt) {
      interview.live.startedAt = new Date();
    }
    await interview.save();

    return res.status(200).json({
      success: true,
      status: 'live',
      state,
      botStarted: true
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Start Interview Error',
      code: 'START_ERROR',
      message: err.message
    });
  }
};

/**
 * GET /api/interviews/:id/live-state
 */
export const getLiveState = async (req, res) => {
  try {
    const interview = req.interview;
    if (req.user.role !== 'RECRUITER') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'Live state is only accessible to recruiters.'
      });
    }

    const state = await RedisStateManager.get(interview._id.toString());
    if (!state) {
      return res.status(200).json({
        success: true,
        liveState: {
          phase: 'not_started',
          status: interview.status,
          current_question: null,
          progress: null,
          skill_state: {},
          claim_verification: {},
          evidence_gaps: [],
          elapsedMs: 0,
          error: false
        }
      });
    }

    // Sanitized output per §7: never exposes LLM rationale to CAND or unneeded internals
    const sanitized = {
      phase: state.interview_state.current_phase,
      current_question: state.interview_state.current_question,
      progress: state.interview_state.progress,
      skill_state: state.interview_state.skill_state,
      claim_verification: state.interview_state.claim_verification,
      evidence_gaps: (state.interview_state.evidence_gaps || []).filter((g) => !g.resolved),
      elapsedMs: state.interview_state.progress?.startedAt
        ? Math.max(0, Date.now() - new Date(state.interview_state.progress.startedAt).getTime())
        : (state.interview_state.progress?.elapsedMs || 0),
      status: state.interview_state.interview_status,
      error: state.interview_state.interview_status === 'error'
    };

    return res.status(200).json({
      success: true,
      liveState: sanitized
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Live State Error',
      code: 'LIVE_STATE_ERROR',
      message: err.message
    });
  }
};

/**
 * POST /api/interviews/:id/end
 */
export const endLiveInterview = async (req, res) => {
  try {
    const interview = req.interview;
    const endedByRole = req.user.role === 'CANDIDATE' ? 'candidate' : 'recruiter';
    const isPartial = req.body?.partial === true;

    const result = await finalizeInterview(interview._id, {
      endedBy: endedByRole,
      isPartial
    });

    return res.status(200).json({
      success: true,
      status: result.interview.status,
      endedBy: result.interview.live?.endedBy || endedByRole,
      alreadyEnded: result.alreadyFinalized,
      reportId: result.report?._id
    });
  } catch (err) {
    return res.status(500).json({
      error: 'End Interview Error',
      code: 'END_ERROR',
      message: err.message
    });
  }
};

/**
 * GET /api/interviews/:id/report
 */
export const getInterviewReport = async (req, res) => {
  try {
    const interview = req.interview;
    if (req.user.role !== 'RECRUITER') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'Assessment reports are only accessible to recruiters.'
      });
    }

    // 404 until interview is completed or partial
    if (!['completed', 'partial'].includes(interview.status)) {
      return res.status(404).json({
        error: 'Report Not Ready',
        code: 'REPORT_NOT_FOUND',
        message: 'Assessment report is not available until the interview has been finalized.'
      });
    }

    const report = await AssessmentReport.findOne({ interviewId: interview._id })
      .populate('candidateId', 'name email role')
      .populate('interviewId', 'title status scheduledAt');

    if (!report) {
      return res.status(404).json({
        error: 'Report Not Found',
        code: 'REPORT_NOT_FOUND',
        message: 'Assessment report has not been generated yet for this interview.'
      });
    }

    const reportObj = report.toObject();

    // Ensure recommendation is present (calculate dynamically if missing from legacy records)
    if (!reportObj.recommendation || !reportObj.recommendation.decision) {
      reportObj.recommendation = computeRecommendation(reportObj);
    }

    return res.status(200).json({
      success: true,
      report: reportObj
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Report Error',
      code: 'REPORT_ERROR',
      message: err.message
    });
  }
};

