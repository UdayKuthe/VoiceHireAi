import { z } from 'zod';

export const candidateInfoSchema = z.object({
  name: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  location: z.string().default('')
});

export const resumeSkillSchema = z.object({
  name: z.string(),
  level: z.string().optional().default(''),
  evidence: z.string().optional().default('')
});

export const resumeProjectSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  technologies: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([])
});

export const resumeExperienceSchema = z.object({
  company: z.string().default(''),
  role: z.string().optional().default(''),
  years: z.number().nullable().optional().default(null),
  durationMonths: z.number().nullable().optional().default(null),
  caption: z.string().optional().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  isCurrent: z.boolean().default(false),
  durationText: z.string().default(''),
  yearsEditedByRecruiter: z.boolean().default(false),
  warning: z.string().optional().default(''),
  sourceText: z.string().default(''),
  page: z.number().int().default(0)
});

export const experienceSummarySchema = z.object({
  totalYears: z.number().default(0),
  experienceLevel: z.string().default(''),
  jdExperienceGap: z.string().default(''),
  levelOverriddenByRecruiter: z.boolean().default(false),
  warnings: z.array(z.string()).default([])
});

export const resumeEducationSchema = z.object({
  institution: z.string().default(''),
  degree: z.string().default(''),
  year: z.string().default('')
}).passthrough();

export const resumeClaimSchema = z.object({
  text: z.string(),
  relatedSkill: z.string().optional().default(''),
  relatedProject: z.string().optional().default('')
});

export const resumeDataSchema = z.object({
  candidate: candidateInfoSchema.default({ name: '', email: '', phone: '', location: '' }),
  skills: z.array(resumeSkillSchema).default([]),
  projects: z.array(resumeProjectSchema).default([]),
  experience: z.array(resumeExperienceSchema).default([]),
  experienceSummary: experienceSummarySchema.optional().default(() => ({
    totalYears: 0,
    experienceLevel: '',
    jdExperienceGap: '',
    levelOverriddenByRecruiter: false,
    warnings: []
  })),
  education: z.array(resumeEducationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  claims: z.array(resumeClaimSchema).default([])
});

export default resumeDataSchema;
