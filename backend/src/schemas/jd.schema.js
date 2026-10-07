import { z } from 'zod';

export const jdDataSchema = z.object({
  job_title: z.string().default(''),
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  experience_requirements: z.string().default('')
});

export default jdDataSchema;
