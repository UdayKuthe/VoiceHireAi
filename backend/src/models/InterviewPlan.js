import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    topics: [{ type: String }],
    questionBudget: { type: Number, default: 0 }
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    type: {
      type: String,
      enum: ['introduction', 'project', 'remaining_requirements'],
      required: true
    },
    title: { type: String, required: true },
    projectName: { type: String, default: '' },
    projectPriority: {
      type: String,
      enum: ['high', 'medium', 'low', ''],
      default: ''
    },
    resumeClaims: [{ type: String }],
    groups: [groupSchema]
  },
  { _id: false }
);

const interviewPlanSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      unique: true
    },
    sections: [sectionSchema]
  },
  {
    timestamps: true
  }
);

export const InterviewPlan = mongoose.model('InterviewPlan', interviewPlanSchema);
export default InterviewPlan;

