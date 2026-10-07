import fs from 'fs';
import { Interview } from '../models/Interview.js';
import { Resume } from '../models/Resume.js';
import { JobDescription } from '../models/JobDescription.js';
import { Mapping } from '../models/Mapping.js';
import { InterviewPlan } from '../models/InterviewPlan.js';
import { ResumeExtractionService } from '../services/resumeExtraction.service.js';
import { JdExtractionService } from '../services/jdExtraction.service.js';
import { MappingService } from '../services/mapping.service.js';
import { PlanningService } from '../services/planning.service.js';
import { resumeDataSchema } from '../schemas/resume.schema.js';
import { jdDataSchema } from '../schemas/jd.schema.js';

/**
 * Helper to verify recruiter owns the interview
 */
const getOwnedInterview = async (interviewId, recruiterId) => {
  const interview = await Interview.findById(interviewId);
  if (!interview) {
    const err = new Error(`Interview with ID ${interviewId} not found.`);
    err.statusCode = 404;
    throw err;
  }

  if (interview.recruiterId.toString() !== recruiterId.toString()) {
    const err = new Error('Forbidden: You do not have permission to access or modify this interview.');
    err.statusCode = 403;
    throw err;
  }

  return interview;
};

/**
 * POST /api/interviews/:id/resume
 */
export const uploadResume = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    // Save or update uploaded resume record
    let resume = await Resume.findOne({ interviewId: interview._id });
    if (!resume) {
      resume = new Resume({
        interviewId: interview._id,
        candidateId: interview.candidateId,
        fileName: req.file.originalname,
        tempFilePath: req.file.path,
        status: 'uploaded',
        error: null
      });
    } else {
      // Clean up previous file if different
      if (resume.tempFilePath && resume.tempFilePath !== req.file.path && fs.existsSync(resume.tempFilePath)) {
        try {
          fs.unlinkSync(resume.tempFilePath);
        } catch {}
      }
      resume.fileName = req.file.originalname;
      resume.tempFilePath = req.file.path;
      resume.status = 'uploaded';
      resume.error = null;
    }

    await resume.save();

    await Interview.findByIdAndUpdate(interview._id, {
      resumeId: resume._id
    });

    res.status(200).json({
      success: true,
      message: 'Resume PDF uploaded successfully.',
      resume: {
        _id: resume._id,
        fileName: resume.fileName,
        status: resume.status,
        uploadedAt: resume.uploadedAt
      }
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    next(error);
  }
};

/**
 * POST /api/interviews/:id/jd
 */
export const uploadJd = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    let jd = await JobDescription.findOne({ interviewId: interview._id });
    if (!jd) {
      jd = new JobDescription({
        interviewId: interview._id,
        fileName: req.file.originalname,
        tempFilePath: req.file.path,
        status: 'uploaded',
        error: null
      });
    } else {
      if (jd.tempFilePath && jd.tempFilePath !== req.file.path && fs.existsSync(jd.tempFilePath)) {
        try {
          fs.unlinkSync(jd.tempFilePath);
        } catch {}
      }
      jd.fileName = req.file.originalname;
      jd.tempFilePath = req.file.path;
      jd.status = 'uploaded';
      jd.error = null;
    }

    await jd.save();

    await Interview.findByIdAndUpdate(interview._id, {
      jdId: jd._id
    });

    res.status(200).json({
      success: true,
      message: 'Job Description PDF uploaded successfully.',
      jd: {
        _id: jd._id,
        fileName: jd.fileName,
        status: jd.status,
        uploadedAt: jd.uploadedAt
      }
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    next(error);
  }
};

/**
 * POST /api/interviews/:id/extract
 * Runs extraction for Resume and JD in parallel
 */
export const extractInterviewDocs = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    const resume = await Resume.findOne({ interviewId: interview._id });
    if (!resume) {
      const err = new Error('No resume uploaded for this interview. Please upload a resume first.');
      err.statusCode = 400;
      throw err;
    }

    const jd = await JobDescription.findOne({ interviewId: interview._id });
    if (!jd) {
      const err = new Error('No Job Description uploaded for this interview. Please upload a JD first.');
      err.statusCode = 400;
      throw err;
    }

    const resumePath = resume.tempFilePath;
    const resumeFileExists = resumePath && fs.existsSync(resumePath);
    if (!resumeFileExists && !resume.data) {
      const err = new Error('Uploaded resume PDF file was not found on the server. Please re-upload your resume PDF.');
      err.statusCode = 400;
      throw err;
    }

    const jdPath = jd.tempFilePath;
    const jdFileExists = jdPath && fs.existsSync(jdPath);
    if (!jdFileExists && !jd.data) {
      const err = new Error('Uploaded Job Description PDF file was not found on the server. Please re-upload your JD PDF.');
      err.statusCode = 400;
      throw err;
    }

    await Interview.findByIdAndUpdate(interview._id, {
      analysisStatus: 'extracting'
    });

    const tasks = [];

    // Parallel extraction task for Resume
    if (resumeFileExists) {
      tasks.push(
        ResumeExtractionService.extractResume({
          interviewId: interview._id,
          candidateId: interview.candidateId,
          filePath: resume.tempFilePath,
          fileName: resume.fileName
        })
      );
    } else {
      tasks.push(Promise.resolve(resume));
    }

    // Parallel extraction task for JD
    if (jdFileExists) {
      tasks.push(
        JdExtractionService.extractJd({
          interviewId: interview._id,
          filePath: jd.tempFilePath,
          fileName: jd.fileName
        })
      );
    } else {
      tasks.push(Promise.resolve(jd));
    }

    const [extractedResume, extractedJd] = await Promise.all(tasks);

    await Interview.findByIdAndUpdate(interview._id, {
      analysisStatus: 'none'
    });

    res.status(200).json({
      success: true,
      message: 'Extraction completed successfully for both Resume and Job Description.',
      resume: extractedResume,
      jd: extractedJd
    });
  } catch (error) {
    await Interview.findByIdAndUpdate(req.params.id, {
      analysisStatus: 'failed'
    });
    next(error);
  }
};

/**
 * POST /api/interviews/:id/map
 */
export const mapSkills = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);
    const mapping = await MappingService.generateMapping(interview._id);

    res.status(200).json({
      success: true,
      message: 'Skill mapping generated successfully.',
      mapping
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/interviews/:id/plan
 */
export const generatePlan = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);
    const plan = await PlanningService.generatePlan(interview._id);

    res.status(200).json({
      success: true,
      message: 'Interview plan generated successfully.',
      plan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/interviews/:id/analysis
 */
export const getAnalysis = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    const [resume, jd, mapping, plan] = await Promise.all([
      Resume.findOne({ interviewId: interview._id }),
      JobDescription.findOne({ interviewId: interview._id }),
      Mapping.findOne({ interviewId: interview._id }),
      InterviewPlan.findOne({ interviewId: interview._id })
    ]);

    res.status(200).json({
      success: true,
      resume,
      jd,
      mapping,
      plan,
      analysisStatus: interview.analysisStatus || 'none'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/interviews/:id/resume/data
 */
export const updateResumeData = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    const validatedData = resumeDataSchema.parse(req.body);

    const resume = await Resume.findOneAndUpdate(
      { interviewId: interview._id },
      {
        data: validatedData,
        editedByRecruiter: true
      },
      { returnDocument: 'after' }
    );

    if (!resume) {
      const err = new Error('Resume record not found.');
      err.statusCode = 404;
      throw err;
    }

    res.status(200).json({
      success: true,
      message: 'Resume data updated successfully by recruiter.',
      resume
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/interviews/:id/jd/data
 */
export const updateJdData = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);

    const validatedData = jdDataSchema.parse(req.body);

    const jd = await JobDescription.findOneAndUpdate(
      { interviewId: interview._id },
      {
        data: validatedData,
        editedByRecruiter: true
      },
      { returnDocument: 'after' }
    );

    if (!jd) {
      const err = new Error('Job description record not found.');
      err.statusCode = 404;
      throw err;
    }

    res.status(200).json({
      success: true,
      message: 'Job Description data updated successfully by recruiter.',
      jd
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/interviews/:id/plan
 */
export const updatePlan = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);
    const sections = req.body.sections || req.body.items;
    const plan = await PlanningService.updatePlan(interview._id, sections);

    res.status(200).json({
      success: true,
      message: 'Interview plan updated successfully.',
      plan
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/interviews/:id/project-priority
 * Recruiter override for project priority
 */
export const updateProjectPriority = async (req, res, next) => {
  try {
    const interview = await getOwnedInterview(req.params.id, req.user._id);
    const { projectName, priority } = req.body;

    if (!projectName || !['high', 'medium', 'low'].includes(priority)) {
      const err = new Error('projectName and a valid priority (high | medium | low) are required.');
      err.statusCode = 400;
      throw err;
    }

    // 1. Update Mapping.projectPriorities
    let mapping = await Mapping.findOne({ interviewId: interview._id });
    if (mapping) {
      if (!Array.isArray(mapping.projectPriorities)) {
        mapping.projectPriorities = [];
      }
      const existing = mapping.projectPriorities.find(
        (p) => p.projectName.toLowerCase() === projectName.toLowerCase()
      );
      if (existing) {
        existing.priority = priority;
        existing.editedByRecruiter = true;
      } else {
        mapping.projectPriorities.push({
          projectName,
          priority,
          score: priority === 'high' ? 6 : (priority === 'medium' ? 3 : 1),
          matchedJdSkills: [],
          reason: 'Manual recruiter priority assignment',
          editedByRecruiter: true
        });
      }

      // Re-sort high -> medium -> low
      const orderMap = { high: 3, medium: 2, low: 1 };
      mapping.projectPriorities.sort((a, b) => (orderMap[b.priority] || 0) - (orderMap[a.priority] || 0));
      mapping.markModified('projectPriorities');
      await mapping.save();
    }

    // 2. Update Resume.data.projects
    const resume = await Resume.findOne({ interviewId: interview._id });
    if (resume && resume.data && Array.isArray(resume.data.projects)) {
      const rProj = resume.data.projects.find(
        (p) => (p.name || '').toLowerCase() === projectName.toLowerCase()
      );
      if (rProj) {
        rProj.priority = priority;
        rProj.editedByRecruiter = true;
        resume.markModified('data');
        await resume.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Project priority for "${projectName}" updated to "${priority}" by recruiter.`,
      projectPriorities: mapping?.projectPriorities || []
    });
  } catch (error) {
    next(error);
  }
};

