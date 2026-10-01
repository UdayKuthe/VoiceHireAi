import { Router } from 'express';
import {
  getCandidates,
  createInterview,
  getRecruiterInterviews,
  setRecruiterReady,
  updateStatus
} from '../controllers/interviewController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const recruiterAuth = [authenticate, requireRole('RECRUITER')];

router.get('/candidates', recruiterAuth, getCandidates);
router.post('/interviews', recruiterAuth, createInterview);
router.get('/interviews', recruiterAuth, getRecruiterInterviews);
router.patch('/interviews/:id/ready', recruiterAuth, setRecruiterReady);
router.patch('/interviews/:id/status', recruiterAuth, updateStatus);

export default router;
