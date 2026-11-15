// Shared request/response contracts for /api/extract and /api/rescue (spec: AI orchestration).
// Imported by both the browser client and the serverless functions, so keep it free of
// browser/Node-only code and of `@/` imports (the api/ bundle resolves relative paths only).
import { z } from 'zod';

export const MAX_CHARS = 30_000;

// ---------- Error envelope ----------

export const ERROR_CODES = [
  'INPUT_TOO_LONG',
  'INPUT_INVALID',
  'MODEL_REFUSED',
  'MODEL_INVALID_OUTPUT',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'TIMEOUT',
  'AI_NOT_CONFIGURED',
] as const;
export type ApiErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP: Record<ApiErrorCode, number> = {
  INPUT_TOO_LONG: 413,
  INPUT_INVALID: 400,
  MODEL_REFUSED: 422,
  MODEL_INVALID_OUTPUT: 502,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  AI_NOT_CONFIGURED: 500,
};

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
}

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

// ---------- Extract ----------

export const ExtractRequestSchema = z.object({
  name: z.string().max(120),
  // Length is checked separately so an over-long text gets INPUT_TOO_LONG, not INPUT_INVALID.
  text: z.string().refine((s) => s.trim().length > 0, 'text is empty'),
  deadline: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'deadline must be an ISO date'),
  workHoursPerDay: z.number().positive().max(24),
  members: z.array(z.object({ name: z.string().max(60), hoursPerDay: z.number().min(0).max(24) })).max(12),
  detectMembers: z.boolean(),
  /** false = the user never touched the deadline picker, so a due date stated in the text wins. Missing = true. */
  deadlineFromUser: z.boolean().optional(),
  /** The user's IANA time zone (e.g. "America/New_York"), to read "due Sunday 5pm" in local time. */
  timeZone: z.string().max(64).optional(),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

/** What the model must return (spec: "Extract: model output schema"). All fields required; nullable where optional. */
export const ExtractModelOutputSchema = z.object({
  projectName: z.string().nullable(),
  /** Due date stated in the text, as local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD"); null if none. */
  dueDate: z.string().nullable(),
  members: z.array(z.object({ name: z.string(), hoursPerDay: z.number().nullable() })),
  tasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      ownerName: z.string().nullable(),
      estimateHours: z.number(),
      estimateInferred: z.boolean(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
      dependsOnKeys: z.array(z.string()),
      evidence: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  openQuestions: z.array(
    z.object({
      taskKey: z.string().nullable(),
      field: z.enum(['owner', 'estimate', 'dependency', 'scope', 'status']),
      question: z.string(),
    }),
  ),
});
export type ExtractModelOutput = z.infer<typeof ExtractModelOutputSchema>;

// Response data is a full Project (validated on the client with ProjectSchema from src/core/schema).

// ---------- Rescue ----------

export const RESCUE_KINDS = ['cut', 'reassign', 'split', 'start_now', 'reduce_scope'] as const;

/** Compact, raw-text-free view of the project the client sends for a rescue plan. */
export const RescueRequestSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        ownerId: z.string().nullable(),
        remainingHours: z.number(),
        status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
        dependsOn: z.array(z.string()),
        slackHours: z.number(),
        isCritical: z.boolean(),
        downstreamCount: z.number(),
      }),
    )
    .max(150),
  members: z.array(z.object({ id: z.string(), name: z.string(), loadRatio: z.number() })).max(12),
  durationHours: z.number(),
  availableHours: z.number(),
  bufferHours: z.number(),
  risks: z.array(z.object({ kind: z.string(), title: z.string(), detail: z.string() })).max(5),
});
export type RescueRequest = z.infer<typeof RescueRequestSchema>;

export const RescueModelOutputSchema = z.object({
  actions: z
    .array(
      z.object({
        kind: z.enum(RESCUE_KINDS),
        taskId: z.string(),
        toMemberId: z.string().nullable(),
        newEstimateHours: z.number().nullable(),
        rationale: z.string(),
      }),
    )
    .max(5),
});

export interface RescueProposal {
  kind: (typeof RESCUE_KINDS)[number];
  taskId: string;
  toMemberId?: string;
  newEstimateHours?: number;
  rationale: string;
}
