import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done']);
export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  hoursPerDay: z.number().positive(),
  color: z.string(),
});

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  ownerId: z.string().nullable(),
  estimateHours: z.number().min(0.25).max(80),
  status: taskStatusSchema,
  dependsOn: z.array(z.string()),
  source: z.enum(['ai', 'user']),
  confidence: confidenceSchema.optional(),
  estimateInferred: z.boolean().optional(),
  evidence: z.string().max(160).optional(),
  cut: z.boolean().optional(),
});

export const openQuestionSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  field: z.enum(['owner', 'estimate', 'dependency', 'scope', 'status']),
  question: z.string(),
  dismissed: z.boolean(),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  deadline: z.string(),
  workHoursPerDay: z.number().positive(),
  members: z.array(memberSchema),
  tasks: z.array(taskSchema),
  rawInput: z.string(),
  openQuestions: z.array(openQuestionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectInput = z.infer<typeof projectSchema>;
