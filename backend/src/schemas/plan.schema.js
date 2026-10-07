import { z } from 'zod';

export const planGroupSchema = z.object({
  name: z.string(),
  topics: z.array(z.string()).default([]),
  questionBudget: z.number().int().min(0).default(0)
});

export const planSectionSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(['introduction', 'project', 'remaining_requirements']),
  title: z.string(),
  projectName: z.string().optional().default(''),
  projectPriority: z.enum(['high', 'medium', 'low', '']).optional().default(''),
  resumeClaims: z.array(z.string()).optional().default([]),
  groups: z.array(planGroupSchema).default([])
});

export const interviewPlanDataSchema = z.object({
  sections: z.array(planSectionSchema).default([])
});

export default interviewPlanDataSchema;

