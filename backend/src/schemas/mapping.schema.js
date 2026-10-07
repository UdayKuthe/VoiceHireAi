import { z } from 'zod';

export const verificationPrioritySchema = z.object({
  item: z.string(),
  reason: z.string().default(''),
  priority: z.enum(['high', 'medium', 'low']).default('high')
});

export const matchedJdSkillSchema = z.object({
  skill: z.string(),
  jdPriority: z.enum(['high', 'medium', 'low']).default('high')
});

export const projectPrioritySchema = z.object({
  projectName: z.string(),
  priority: z.enum(['high', 'medium', 'low']).default('low'),
  score: z.number().default(0),
  matchedJdSkills: z.array(matchedJdSkillSchema).default([]),
  reason: z.string().default(''),
  editedByRecruiter: z.boolean().default(false)
});

export const skillDetailSchema = z.object({
  skill: z.string(),
  status: z.enum(['matched', 'partial', 'missing']).default('matched'),
  jdPriority: z.enum(['high', 'medium', 'low']).default('high')
});

export const mappingDataSchema = z.object({
  matchedSkills: z.array(z.string()).default([]),
  partialSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  verificationPriorities: z.array(verificationPrioritySchema).default([]),
  projectPriorities: z.array(projectPrioritySchema).default([]),
  skillDetails: z.array(skillDetailSchema).default([])
});

export default mappingDataSchema;
