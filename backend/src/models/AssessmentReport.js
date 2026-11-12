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

const skillAssessedSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['not_assessed', 'observed', 'partially_verified', 'sufficiently_verified', 'unverified', 'contradictory'],
      default: 'not_assessed'
    },
    evidenceCount: { type: Number, default: 0 },
    snippets: [{ type: String }]
  },
  { _id: false }
);

const claimAssessmentSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    project: { type: String, default: '' },
    status: {
      type: String,
      enum: ['not_assessed', 'observed', 'partially_verified', 'sufficiently_verified', 'unverified', 'contradictory'],
      default: 'not_assessed'
    },
    notes: { type: String, default: '' }
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
    candidateSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    summaryText: {
      type: String,
      default: ''
    },
    skillsAssessed: [skillAssessedSchema],
    claims: [claimAssessmentSchema],
    remainingGaps: [
      {
        targetRef: {
          type: { type: String },
          key: { type: String }
        },
        description: { type: String }
      }
    ],
    questionAnswerHistory: [{ type: mongoose.Schema.Types.Mixed }],
    coverage: {
      sectionsDone: { type: Number, default: 0 },
      groupsDone: { type: Number, default: 0 }
    },
    durationMs: {
      type: Number,
      default: 0
    },
    endedBy: {
      type: String,
      enum: ['candidate', 'recruiter', 'system', ''],
      default: ''
    },
    partial: {
      type: Boolean,
      default: false
    },
    generatedAt: {
      type: Date,
      default: Date.now
    },
    // Backward compatibility fields from Phase 2
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

export const AssessmentReport = mongoose.models.AssessmentReport || mongoose.model('AssessmentReport', assessmentReportSchema);
export default AssessmentReport;
