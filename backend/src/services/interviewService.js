import { Interview } from '../models/Interview.js';
import { User } from '../models/User.js';

export class InterviewService {
  /**
   * Helper to format interview with computed status for JSON response
   */
  static formatInterview(interviewDoc) {
    const obj = interviewDoc.toObject ? interviewDoc.toObject() : { ...interviewDoc };
    if (typeof interviewDoc.getComputedStatus === 'function') {
      obj.status = interviewDoc.getComputedStatus();
    }
    return obj;
  }

  /**
   * Get all registered candidates for recruiter selection
   */
  static async getCandidates() {
    const candidates = await User.find({ role: 'CANDIDATE' })
      .select('name email createdAt')
      .sort({ name: 1 });
    return candidates;
  }

  /**
   * Recruiter creates an interview
   */
  static async createInterview({ recruiterId, title, candidateId, scheduledAt }) {
    if (!title || !title.trim()) {
      const error = new Error('Interview title is required.');
      error.statusCode = 400;
      throw error;
    }

    if (!candidateId) {
      const error = new Error('Candidate selection is required.');
      error.statusCode = 400;
      throw error;
    }

    const candidate = await User.findOne({ _id: candidateId, role: 'CANDIDATE' });
    if (!candidate) {
      const error = new Error('Selected candidate does not exist or is not a valid candidate account.');
      error.statusCode = 400;
      throw error;
    }

    let parsedScheduledAt = null;
    let initialStatus = 'draft';

    if (scheduledAt) {
      parsedScheduledAt = new Date(scheduledAt);
      if (isNaN(parsedScheduledAt.getTime())) {
        const error = new Error('Invalid scheduledAt date format.');
        error.statusCode = 400;
        throw error;
      }
      initialStatus = 'scheduled';
    }

    const interview = await Interview.create({
      title: title.trim(),
      recruiterId,
      candidateId,
      scheduledAt: parsedScheduledAt,
      status: initialStatus,
      recruiterReady: false,
      candidateReady: false
    });

    await interview.populate([
      { path: 'candidateId', select: 'name email' },
      { path: 'recruiterId', select: 'name email' }
    ]);

    return this.formatInterview(interview);
  }

  /**
   * Recruiter views own interviews
   */
  static async getRecruiterInterviews(recruiterId) {
    const interviews = await Interview.find({ recruiterId })
      .populate('candidateId', 'name email')
      .populate('recruiterId', 'name email')
      .sort({ createdAt: -1 });

    return interviews.map((item) => this.formatInterview(item));
  }

  /**
   * Recruiter toggles ready status
   */
  static async setRecruiterReady(interviewId, recruiterId, ready) {
    if (typeof ready !== 'boolean') {
      const error = new Error('The "ready" field must be a boolean (true or false).');
      error.statusCode = 400;
      throw error;
    }

    const interview = await Interview.findById(interviewId)
      .populate('candidateId', 'name email')
      .populate('recruiterId', 'name email');

    if (!interview) {
      const error = new Error(`Interview with ID ${interviewId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (interview.recruiterId._id.toString() !== recruiterId.toString()) {
      const error = new Error('Forbidden: You can only update interviews that you created.');
      error.statusCode = 403;
      throw error;
    }

    if (['completed', 'cancelled'].includes(interview.status)) {
      const error = new Error(`Cannot change readiness on an interview that is already ${interview.status}.`);
      error.statusCode = 400;
      throw error;
    }

    if (!ready && interview.status === 'live') {
      const error = new Error('Cannot un-ready an interview that is already live in session.');
      error.statusCode = 400;
      throw error;
    }

    interview.recruiterReady = ready;

    if (ready) {
      // If candidate is already ready, transition to live; otherwise recruiter_ready
      if (interview.candidateReady) {
        interview.status = 'live';
      } else {
        interview.status = 'recruiter_ready';
      }
    } else {
      // Unready toggle: reset status back to scheduled or draft
      interview.status = interview.scheduledAt ? 'scheduled' : 'draft';
    }

    await interview.save();
    return this.formatInterview(interview);
  }

  /**
   * Recruiter marks status as completed or cancelled
   */
  static async updateStatus(interviewId, recruiterId, newStatus) {
    if (!['completed', 'cancelled'].includes(newStatus)) {
      const error = new Error('Invalid status update. Only "completed" or "cancelled" are permitted.');
      error.statusCode = 400;
      throw error;
    }

    const interview = await Interview.findById(interviewId)
      .populate('candidateId', 'name email')
      .populate('recruiterId', 'name email');

    if (!interview) {
      const error = new Error(`Interview with ID ${interviewId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (interview.recruiterId._id.toString() !== recruiterId.toString()) {
      const error = new Error('Forbidden: You can only update interviews that you created.');
      error.statusCode = 403;
      throw error;
    }

    if (interview.status === 'completed') {
      const error = new Error('Interview has already been completed.');
      error.statusCode = 400;
      throw error;
    }

    if (interview.status === 'cancelled') {
      const error = new Error('Interview has already been cancelled.');
      error.statusCode = 400;
      throw error;
    }

    interview.status = newStatus;
    if (newStatus === 'cancelled') {
      interview.recruiterReady = false;
      interview.candidateReady = false;
    }

    await interview.save();
    return this.formatInterview(interview);
  }

  /**
   * Candidate views own interviews
   */
  static async getCandidateInterviews(candidateId) {
    const interviews = await Interview.find({ candidateId })
      .populate('recruiterId', 'name email')
      .populate('candidateId', 'name email')
      .sort({ scheduledAt: 1, createdAt: -1 });

    return interviews.map((item) => this.formatInterview(item));
  }

  /**
   * Candidate joins an interview
   */
  static async candidateJoin(interviewId, candidateId) {
    const interview = await Interview.findById(interviewId)
      .populate('candidateId', 'name email')
      .populate('recruiterId', 'name email');

    if (!interview) {
      const error = new Error(`Interview with ID ${interviewId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (interview.candidateId._id.toString() !== candidateId.toString()) {
      const error = new Error('Forbidden: You can only join interviews scheduled for your candidate account.');
      error.statusCode = 403;
      throw error;
    }

    if (interview.status === 'completed') {
      const error = new Error('Cannot join: This interview has already been completed.');
      error.statusCode = 400;
      throw error;
    }

    if (interview.status === 'cancelled') {
      const error = new Error('Cannot join: This interview has been cancelled by the recruiter.');
      error.statusCode = 400;
      throw error;
    }

    // Critical constraint from task_prd.md:
    // Candidate joins (only when recruiterReady=true) -> candidateReady=true; live once both are ready
    if (!interview.recruiterReady) {
      const error = new Error('Cannot join interview yet: The recruiter has not marked themselves as ready.');
      error.statusCode = 400;
      throw error;
    }

    interview.candidateReady = true;
    interview.status = 'live';

    await interview.save();
    return this.formatInterview(interview);
  }
}
