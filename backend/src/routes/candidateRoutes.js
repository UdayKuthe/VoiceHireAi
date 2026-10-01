import { Router } from 'express';
import {
  getCandidateInterviews,
  candidateJoin
} from '../controllers/interviewController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// All candidate routes require valid JWT and CANDIDATE role
router.use(authenticate, requireRole('CANDIDATE'));

router.get('/interviews', getCandidateInterviews);
router.post('/interviews/:id/join', candidateJoin);

export default router;
