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
  company: z.string(),
  role: z.string().default(''),
  duration: z.string().default(''),
  responsibilities: z.array(z.string()).default([])
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
  education: z.array(resumeEducationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  claims: z.array(resumeClaimSchema).default([])
});

export default resumeDataSchema;
