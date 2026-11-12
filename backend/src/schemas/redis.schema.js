/**
 * Redis Active State Schema Definition (Phase 3 Runtime State)
 *
 * Defines the real-time session schema for Redis:
 *  - candidate_context, job_context, assessment_plan, interview_state
 *  - Zod validation and safe transforms for all active working state writes
 *  - Compatible with Phase 2 models and legacy fields
 */

import { z } from 'zod';
import { AssessmentReport } from '../models/AssessmentReport.js';
import { Interview } from '../models/Interview.js';

// ==============================================================================
// 1. Enums & Helpers
// ==============================================================================

export const normalizePriority = (priority) => {
  if (!priority || typeof priority !== 'string') return 'low';
  const lower = priority.trim().toLowerCase();
  if (lower === 'high') return 'high';
  if (lower === 'medium' || lower === 'med') return 'medium';
  if (lower === 'low') return 'low';
  return 'low';
};

export const sectionTypeEnum = z.enum(['intro', 'project', 'requirements']);
export const phaseEnum = z.enum(['intro', 'project', 'requirements', 'wrapup']);
export const priorityEnum = z.enum(['high', 'medium', 'low']);
export const evidenceStatusEnum = z.enum([
  'not_assessed',
  'observed',
  'partially_verified',
  'sufficiently_verified',
  'unverified',
  'contradictory'
]);
export const interviewStatusEnum = z.enum([
  'initializing',
  'active',
  'paused',
  'completing',
  'completed',
  'partial',
  'error'
]);

// ==============================================================================
// 2. Component Shapes
// ==============================================================================

export const redisCompanySchema = z.object({
  company: z.string().default(''),
  years: z.number().default(0)
}).passthrough();

export const redisCandidateExperienceSchema = z.object({
  experienceLevel: z.enum(['fresher', 'junior', 'mid', 'senior', '']).default(''),
  totalYears: z.number().default(0),
  companies: z.array(redisCompanySchema).default([])
}).passthrough();

export const redisInterviewDifficultySchema = z.record(
  z.string(),
  z.enum(['easy', 'medium', 'hard']).default('medium')
);

export const targetRefSchema = z.object({
  type: z.enum(['skill', 'claim', 'requirement', 'topic']),
  key: z.string()
}).passthrough();

export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  section: z.number().default(1),
  project: z.string().nullable().default(null),
  group: z.string().default(''),
  kind: z.enum(['main', 'probe', 'clarify', 'reprompt']).default('main'),
  targetRef: targetRefSchema.optional().nullable(),
  askedAt: z.string().default(() => new Date().toISOString())
}).passthrough();

export const answerSchema = z.object({
  questionId: z.string(),
  transcript: z.string().default(''),
  startedAt: z.string().default(() => new Date().toISOString()),
  endedAt: z.string().default(() => new Date().toISOString()),
  durationMs: z.number().default(0),
  status: z.enum(['answered', 'no_response']).default('answered'),
  analysisStatus: z.enum(['done', 'pending', 'failed']).default('pending')
}).passthrough();

export const evidenceSchema = z.object({
  id: z.string(),
  answerId: z.string(),
  skill: z.string().nullable().default(null),
  claimRef: z.string().nullable().default(null),
  project: z.string().nullable().default(null),
  snippet: z.string().max(200).default(''),
  type: z.enum(['ownership', 'technical_depth', 'tradeoff', 'metric', 'uncertainty', 'contradiction']).default('technical_depth'),
  strength: z.number().min(0).max(3).default(1)
}).passthrough();

export const skillStateEntrySchema = z.object({
  status: evidenceStatusEnum.default('not_assessed'),
  evidenceIds: z.array(z.string()).default([]),
  lastUpdated: z.string().default(() => new Date().toISOString())
}).passthrough();

export const claimVerificationEntrySchema = z.object({
  claimText: z.string().default(''),
  status: evidenceStatusEnum.default('not_assessed'),
  evidenceIds: z.array(z.string()).default([]),
  notes: z.string().default('')
}).passthrough();

export const evidenceGapSchema = z.object({
  id: z.string(),
  targetRef: targetRefSchema,
  description: z.string(),
  raisedAtQuestionId: z.string(),
  resolved: z.boolean().default(false),
  resolvedAtQuestionId: z.string().nullable().default(null)
}).passthrough();

export const progressSchema = z.object({
  sectionIdx: z.number().default(0),
  groupIdx: z.number().default(0),
  probesUsed: z.number().default(0),
  questionsInGroup: z.number().default(0),
  startedAt: z.string().default(() => new Date().toISOString()),
  elapsedMs: z.number().default(0)
}).passthrough();

// ==============================================================================
// 3. Top-Level Contexts
// ==============================================================================

export const candidateContextSchema = z.object({
  candidateId: z.string().default(''),
  name: z.string().default(''),
  email: z.string().default(''),
  experience: redisCandidateExperienceSchema.default({}),
  skills: z.array(
    z.object({
      name: z.string(),
      level: z.string().optional().default(''),
      evidence: z.string().optional().default(''),
      relevantYears: z.number().optional()
    }).passthrough()
  ).default([]),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().default(''),
      technologies: z.array(z.string()).default([]),
      responsibilities: z.array(z.string()).default([])
    }).passthrough()
  ).default([]),
  claims: z.array(
    z.object({
      text: z.string(),
      relatedProject: z.string().optional().default('')
    }).passthrough()
  ).default([])
}).passthrough();

export const jobContextSchema = z.object({
  job_title: z.string().default(''),
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  experience_requirements: z.string().default('')
}).passthrough();

export const assessmentPlanGroupSchema = z.object({
  name: z.string(),
  baseDifficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  focusAreas: z.array(z.string()).default([])
}).passthrough();

export const assessmentPlanSectionSchema = z.object({
  order: z.number(),
  type: sectionTypeEnum,
  name: z.string(),
  priority: priorityEnum.optional(),
  durationMinutes: z.number().default(10),
  groups: z.array(assessmentPlanGroupSchema).default([])
}).passthrough();

export const assessmentPlanSchema = z.object({
  experienceLevel: z.string().default(''),
  totalYears: z.number().default(0),
  sections: z.array(assessmentPlanSectionSchema).default([])
}).passthrough();

export const interviewStateSchema = z.object({
  current_phase: phaseEnum.default('intro'),
  current_project: z.string().default(''),
  current_group: z.string().default(''),
  current_question: questionSchema.nullable().default(null),
  question_history: z.array(questionSchema).default([]),
  answer_history: z.array(answerSchema).default([]),
  evidence: z.array(evidenceSchema).default([]),
  skill_state: z.record(z.string(), skillStateEntrySchema).default({}),
  claim_verification: z.record(z.string(), claimVerificationEntrySchema).default({}),
  evidence_gaps: z.array(evidenceGapSchema).default([]),
  remaining_areas: z.array(z.string()).default([]),
  interview_status: interviewStatusEnum.default('initializing'),
  progress: progressSchema.default({}),
  consent: z.boolean().default(false),
  analysis_queue: z.array(z.any()).default([]),
  question_bank: z
    .record(
      z.string(),
      z
        .object({
          text: z.string(),
          targetRef: targetRefSchema.optional(),
          source: z.enum(['llm', 'template']).default('llm')
        })
        .passthrough()
    )
    .default({})
}).passthrough();

// Root working-state schema
export const redisActiveStateSchema = z.object({
  candidate_context: candidateContextSchema,
  job_context: jobContextSchema,
  assessment_plan: assessmentPlanSchema,
  interview_state: interviewStateSchema
}).passthrough();

// ==============================================================================
// 4. Backward Compatibility Helper Class
// ==============================================================================

export class RedisStateService {
  /**
   * Generates candidate_context.experience payload for Redis
   */
  static formatCandidateExperienceState(resumeData) {
    const summary = resumeData?.experienceSummary || {};
    const rawRoles = Array.isArray(resumeData?.experience) ? resumeData.experience : [];

    const companies = rawRoles.map((r) => ({
      company: r.company || '',
      years: typeof r.years === 'number' ? r.years : 0
    }));

    return redisCandidateExperienceSchema.parse({
      experienceLevel: summary.experienceLevel || '',
      totalYears: summary.totalYears || 0,
      companies
    });
  }

  /**
   * Initializes section difficulty map for Redis interview_state
   */
  static formatInitialDifficultyState(planSections) {
    const difficultyMap = {};
    if (Array.isArray(planSections)) {
      for (const sec of planSections) {
        const key = `section_${sec.order}`;
        const firstGroupDiff = sec.groups?.[0]?.baseDifficulty || 'medium';
        difficultyMap[key] = firstGroupDiff;
      }
    }
    return difficultyMap;
  }

  /**
   * Persists runtime final values from Redis active state back to MongoDB AssessmentReport & Interview
   */
  static async persistStateToMongo({
    interviewId,
    candidateId,
    experienceSummary,
    difficultyTrail = [],
    finalDifficultyMap = {}
  }) {
    if (!interviewId) return null;

    const report = await AssessmentReport.findOneAndUpdate(
      { interviewId },
      {
        interviewId,
        candidateId,
        experienceSummary,
        difficultyTrail,
        status: 'completed'
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    if (experienceSummary?.experienceLevel) {
      await Interview.findByIdAndUpdate(interviewId, {
        experienceLevel: experienceSummary.experienceLevel
      });
    }

    return report;
  }
}

export default RedisStateService;
