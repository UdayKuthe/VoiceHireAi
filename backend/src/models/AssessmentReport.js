import mongoose from 'mongoose';

const difficultyTrailItemSchema = new mongoose.Schema(
  {
    sectionOrder: { type: Number, required: true },
    sectionTitle: { type: String, default: '' },
    groupName: { type: String, default: '' },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    action: {
      type: String,
      enum: ['start', 'step_up', 'step_down', 'maintain'],
      default: 'start'
    },
    answerStatus: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const assessmentReportSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      unique: true
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    experienceSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    difficultyTrail: [difficultyTrailItemSchema],
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

export const AssessmentReport = mongoose.model('AssessmentReport', assessmentReportSchema);
export default AssessmentReport;

