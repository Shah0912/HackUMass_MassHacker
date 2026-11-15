// Zod schema for a stored Project: used by JSON import and (later) the server.
import { z } from 'zod';

const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  ownerId: z.string().nullable(),
  estimateHours: z.number(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
  dependsOn: z.array(z.string()),
  source: z.enum(['ai', 'user']),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  estimateInferred: z.boolean().optional(),
  evidence: z.string().optional(),
  cut: z.boolean().optional(),
});

const MemberSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hoursPerDay: z.number().min(0),
  color: z.string(),
});

const OpenQuestionSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  field: z.enum(['owner', 'estimate', 'dependency', 'scope', 'status']),
  question: z.string(),
  dismissed: z.boolean(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  deadline: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'deadline must be an ISO date'),
  workHoursPerDay: z.number().positive(),
  members: z.array(MemberSchema),
  tasks: z.array(TaskSchema),
  rawInput: z.string(),
  openQuestions: z.array(OpenQuestionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
