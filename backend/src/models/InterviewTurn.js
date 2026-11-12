import mongoose from 'mongoose';

const interviewTurnSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      index: true
    },
    seq: {
      type: Number,
      required: true
    },
    question: {
      id: { type: String, required: true },
      text: { type: String, required: true },
      section: { type: Number, default: 1 },
      project: { type: String, default: null },
      group: { type: String, default: '' },
      kind: {
        type: String,
        enum: ['main', 'probe', 'clarify', 'reprompt'],
        default: 'main'
      },
      targetRef: {
        type: { type: String, enum: ['skill', 'claim', 'requirement', 'topic'] },
        key: { type: String }
      },
      askedAt: { type: String, default: () => new Date().toISOString() }
    },
    answer: {
      questionId: { type: String, required: true },
      transcript: { type: String, default: '' },
      startedAt: { type: String, default: () => new Date().toISOString() },
      endedAt: { type: String, default: () => new Date().toISOString() },
      durationMs: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['answered', 'no_response'],
        default: 'answered'
      },
      analysisStatus: {
        type: String,
        enum: ['done', 'pending', 'failed'],
        default: 'pending'
      }
    },
    evidence: [
      {
        id: { type: String, required: true },
        answerId: { type: String, required: true },
        skill: { type: String, default: null },
        claimRef: { type: String, default: null },
        project: { type: String, default: null },
        snippet: { type: String, default: '' },
        type: {
          type: String,
          enum: ['ownership', 'technical_depth', 'tradeoff', 'metric', 'uncertainty', 'contradiction'],
          default: 'technical_depth'
        },
        strength: { type: Number, min: 0, max: 3, default: 1 }
      }
    ],
    ts: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

interviewTurnSchema.index({ interviewId: 1, seq: 1 }, { unique: true });

export const InterviewTurn = mongoose.models.InterviewTurn || mongoose.model('InterviewTurn', interviewTurnSchema);
export default InterviewTurn;

