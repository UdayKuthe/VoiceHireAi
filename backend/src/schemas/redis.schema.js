/**
 * Redis Active State Schema Definition (Phase 3 Runtime State)
 *
 * Defines the real-time session schema for Redis:
 *  - candidate_context.experience: candidate profile and experience metadata
 *  - interview_state.currentDifficulty: dynamic difficulty tracking per section
 *  - persistence methods to write active state back to MongoDB
 */

import { z } from 'zod';
import { AssessmentReport } from '../models/AssessmentReport.js';
import { Interview } from '../models/Interview.js';
import { Resume } from '../models/Resume.js';

// Redis company schema
export const redisCompanySchema = z.object({
  company: z.string().default(''),
  years: z.number().default(0)
});

// Redis candidate_context.experience schema
export const redisCandidateExperienceSchema = z.object({
  experienceLevel: z.enum(['fresher', 'junior', 'mid', 'senior', '']).default(''),
  totalYears: z.number().default(0),
  companies: z.array(redisCompanySchema).default([])
});

// Redis interview_state.currentDifficulty schema (per section)
export const redisInterviewDifficultySchema = z.record(
  z.string(), // sectionId or sectionOrder key e.g. "section_1", "section_2"
  z.enum(['easy', 'medium', 'hard']).default('medium')
);

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

    // Update AssessmentReport with final difficulty trail & experience summary
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

    // Update Interview status and experienceLevel
    if (experienceSummary?.experienceLevel) {
      await Interview.findByIdAndUpdate(interviewId, {
        experienceLevel: experienceSummary.experienceLevel
      });
    }

    return report;
  }
}

export default RedisStateService;

