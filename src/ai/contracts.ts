import { z } from 'zod';
import { projectSchema } from '@/core/schemas';
import type { Project } from '@/core/types';

/** MVP extract request body. */
export type ExtractInput = {
  text: string; // max 30,000 chars
  deadline: string; // ISO 8601
  workHoursPerDay: number; // default 6
  members: { name: string; hoursPerDay: number }[];
};

export type ExtractResponse = { ok: true; data: Project };
export type ApiError = {
  ok: false;
  error: { code: ExtractErrorCode; message: string; retryable: boolean };
};

export type ExtractErrorCode =
  | 'INPUT_TOO_LONG'
  | 'INPUT_INVALID'
  | 'MODEL_REFUSED'
  | 'MODEL_INVALID_OUTPUT'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT';

export const EXTRACT_ERROR_CODES = [
  'INPUT_TOO_LONG',
  'INPUT_INVALID',
  'MODEL_REFUSED',
  'MODEL_INVALID_OUTPUT',
  'UPSTREAM_ERROR',
  'TIMEOUT',
] as const satisfies readonly ExtractErrorCode[];

export const extractInputSchema = z.object({
  text: z.string().max(30_000),
  deadline: z.string().min(1),
  workHoursPerDay: z.number().positive().default(6),
  members: z.array(
    z.object({
      name: z.string().min(1),
      hoursPerDay: z.number().positive(),
    }),
  ),
});

/** Model structured output (no openQuestions in MVP). */
export const extractModelOutputSchema = z.object({
  projectName: z.string().nullable(),
  members: z.array(
    z.object({
      name: z.string(),
      hoursPerDay: z.number().nullable(),
    }),
  ),
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      ownerName: z.string().nullable(),
      estimateHours: z.number(),
      estimateInferred: z.boolean(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
      dependsOnKeys: z.array(z.string()),
      evidence: z.string().max(160),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
});

export type ExtractModelOutput = z.infer<typeof extractModelOutputSchema>;

export const extractSuccessSchema = z.object({
  ok: z.literal(true),
  data: projectSchema,
});

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(EXTRACT_ERROR_CODES),
    message: z.string(),
    retryable: z.boolean(),
  }),
});

export const extractApiResponseSchema = z.discriminatedUnion('ok', [
  extractSuccessSchema,
  apiErrorSchema,
]);
