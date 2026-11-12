import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  verifyInterviewOwnership,
  issueLiveKitToken,
  recordConsent,
  startLiveInterview,
  getLiveState,
  endLiveInterview,
  getInterviewReport
} from '../controllers/interviewLiveController.js';

const router = express.Router();

// All routes require valid user authentication and ownership check
router.use('/:id', authenticate, verifyInterviewOwnership);

// Live interview routes
router.post('/:id/token', issueLiveKitToken);
router.post('/:id/consent', recordConsent);
router.post('/:id/start', startLiveInterview);
router.get('/:id/live-state', getLiveState);
router.post('/:id/end', endLiveInterview);
router.get('/:id/report', getInterviewReport);

export default router;

