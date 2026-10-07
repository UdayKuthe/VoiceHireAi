import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fileName: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    tempFilePath: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'extracted', 'failed'],
      default: 'uploaded'
    },
    error: {
      type: String,
      default: null
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    editedByRecruiter: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export const Resume = mongoose.model('Resume', resumeSchema);
export default Resume;
