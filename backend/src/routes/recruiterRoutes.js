import { Router } from 'express';
import {
  getCandidates,
  createInterview,
  getRecruiterInterviews,
  setRecruiterReady,
  updateStatus
} from '../controllers/interviewController.js';
import {
  uploadResume,
  uploadJd,
  extractInterviewDocs,
  mapSkills,
  generatePlan,
  getAnalysis,
  updateResumeData,
  updateJdData,
  updatePlan,
  updateProjectPriority
} from '../controllers/analysisController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadSinglePdf } from '../middleware/upload.js';

const router = Router();
const recruiterAuth = [authenticate, requireRole('RECRUITER')];

// Phase 1 Routes
router.get('/candidates', recruiterAuth, getCandidates);
router.post('/interviews', recruiterAuth, createInterview);
router.get('/interviews', recruiterAuth, getRecruiterInterviews);
router.patch('/interviews/:id/ready', recruiterAuth, setRecruiterReady);
router.patch('/interviews/:id/status', recruiterAuth, updateStatus);

// Phase 2 Routes: Extraction, Mapping, and Planning
router.post('/interviews/:id/resume', recruiterAuth, uploadSinglePdf('file'), uploadResume);
router.post('/interviews/:id/jd', recruiterAuth, uploadSinglePdf('file'), uploadJd);
router.post('/interviews/:id/extract', recruiterAuth, extractInterviewDocs);
router.post('/interviews/:id/map', recruiterAuth, mapSkills);
router.post('/interviews/:id/plan', recruiterAuth, generatePlan);
router.get('/interviews/:id/analysis', recruiterAuth, getAnalysis);
router.patch('/interviews/:id/resume/data', recruiterAuth, updateResumeData);
router.patch('/interviews/:id/jd/data', recruiterAuth, updateJdData);
router.patch('/interviews/:id/plan', recruiterAuth, updatePlan);
router.patch('/interviews/:id/project-priority', recruiterAuth, updateProjectPriority);

export default router;
