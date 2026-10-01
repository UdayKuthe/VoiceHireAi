import mongoose from 'mongoose';

export const INTERVIEW_STATUSES = [
  'draft',
  'scheduled',
  'reminder',
  'recruiter_ready',
  'candidate_ready',
  'live',
  'completed',
  'cancelled'
];

const interviewSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Interview title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters']
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Candidate ID is required']
    },
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recruiter ID is required']
    },
    scheduledAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: {
        values: INTERVIEW_STATUSES,
        message: 'Invalid interview status: {VALUE}'
      },
      default: 'draft'
    },
    recruiterReady: {
      type: Boolean,
      default: false
    },
    candidateReady: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/**
 * Computes runtime/derived status (such as 'reminder' within 30 minutes of scheduled time)
 */
interviewSchema.methods.getComputedStatus = function () {
  // If explicitly in terminal or live states, return as is
  if (['completed', 'cancelled', 'live', 'recruiter_ready', 'candidate_ready'].includes(this.status)) {
    return this.status;
  }

  // Check 30-minute reminder window for scheduled interviews
  if (this.scheduledAt && (this.status === 'scheduled' || this.status === 'reminder')) {
    const now = Date.now();
    const scheduledTime = new Date(this.scheduledAt).getTime();
    const diff = scheduledTime - now;

    // Within 30 minutes before scheduled time up to 15 minutes past start
    if (diff <= 30 * 60 * 1000 && diff >= -15 * 60 * 1000 && !this.recruiterReady && !this.candidateReady) {
      return 'reminder';
    }
  }

  return this.status;
};

export const Interview = mongoose.model('Interview', interviewSchema);
export default Interview;
