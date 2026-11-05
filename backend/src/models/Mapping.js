import mongoose from 'mongoose';

const mappingSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      unique: true
    },
    experienceLevel: {
      type: String,
      default: ''
    },
    totalYears: {
      type: Number,
      default: 0
    },
    relevantYears: {
      type: Number,
      default: 0
    },
    jdExperienceGap: {
      type: String,
      default: ''
    },
    matchedSkills: {
      type: [String],
      default: []
    },
    partialSkills: {
      type: [String],
      default: []
    },
    missingSkills: {
      type: [String],
      default: []
    },
    verificationPriorities: [
      {
        item: { type: String, required: true },
        reason: { type: String, default: '' },
        priority: {
          type: String,
          enum: ['high', 'medium', 'low'],
          default: 'high'
        }
      }
    ],
    projectPriorities: [
      {
        projectName: { type: String, required: true },
        priority: {
          type: String,
          enum: ['high', 'medium', 'low'],
          default: 'low'
        },
        score: { type: Number, default: 0 },
        matchedJdSkills: [
          {
            skill: { type: String, required: true },
            jdPriority: {
              type: String,
              enum: ['high', 'medium', 'low'],
              default: 'high'
            }
          }
        ],
        reason: { type: String, default: '' },
        editedByRecruiter: { type: Boolean, default: false }
      }
    ],
    skillDetails: [
      {
        skill: { type: String, required: true },
        status: {
          type: String,
          enum: ['matched', 'partial', 'missing'],
          default: 'matched'
        },
        jdPriority: {
          type: String,
          enum: ['high', 'medium', 'low'],
          default: 'high'
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

export const Mapping = mongoose.model('Mapping', mappingSchema);
export default Mapping;
