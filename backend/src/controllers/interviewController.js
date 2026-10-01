import { InterviewService } from '../services/interviewService.js';

export const getCandidates = async (req, res, next) => {
  try {
    const candidates = await InterviewService.getCandidates();
    res.status(200).json({
      success: true,
      candidates
    });
  } catch (error) {
    next(error);
  }
};

export const createInterview = async (req, res, next) => {
  try {
    const { title, candidateId, scheduledAt } = req.body;
    const interview = await InterviewService.createInterview({
      recruiterId: req.user._id,
      title,
      candidateId,
      scheduledAt
    });
    res.status(201).json({
      success: true,
      interview
    });
  } catch (error) {
    next(error);
  }
};

export const getRecruiterInterviews = async (req, res, next) => {
  try {
    const interviews = await InterviewService.getRecruiterInterviews(req.user._id);
    res.status(200).json({
      success: true,
      interviews
    });
  } catch (error) {
    next(error);
  }
};

export const setRecruiterReady = async (req, res, next) => {
  try {
    const { ready } = req.body;
    const interview = await InterviewService.setRecruiterReady(req.params.id, req.user._id, ready);
    res.status(200).json({
      success: true,
      interview
    });
  } catch (error) {
    next(error);
  }
};

export const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const interview = await InterviewService.updateStatus(req.params.id, req.user._id, status);
    res.status(200).json({
      success: true,
      interview
    });
  } catch (error) {
    next(error);
  }
};

export const getCandidateInterviews = async (req, res, next) => {
  try {
    const interviews = await InterviewService.getCandidateInterviews(req.user._id);
    res.status(200).json({
      success: true,
      interviews
    });
  } catch (error) {
    next(error);
  }
};

export const candidateJoin = async (req, res, next) => {
  try {
    const interview = await InterviewService.candidateJoin(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      interview
    });
  } catch (error) {
    next(error);
  }
};
