import {
  extractApiResponseSchema,
  type ApiError,
  type ExtractInput,
  type ExtractResponse,
} from '@/ai/contracts';
import type { Project } from '@/core/types';
import extractFixture from '../../fixtures/extract-response.json';

const MOCK_DELAY_MS = 1500;

export class ExtractHttpError extends Error {
  readonly body: ApiError;
  readonly status: number;

  constructor(status: number, body: ApiError) {
    super(body.error.message);
    this.name = 'ExtractHttpError';
    this.status = status;
    this.body = body;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockProject(input: ExtractInput): Project {
  const envelope = extractFixture as ExtractResponse;
  const data = envelope.data;
  return {
    ...data,
    id: crypto.randomUUID(),
    deadline: input.deadline,
    workHoursPerDay: input.workHoursPerDay,
    rawInput: input.text || data.rawInput,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Client entry point. With VITE_MOCK_AI=1, returns the fixture after 1.5s (no network).
 * Otherwise POSTs to /api/extract.
 */
export async function extractProject(input: ExtractInput): Promise<Project> {
  if (import.meta.env.VITE_MOCK_AI === '1') {
    await delay(MOCK_DELAY_MS);
    return mockProject(input);
  }

  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  const json: unknown = await res.json().catch(() => null);
  const parsed = extractApiResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExtractHttpError(res.status, {
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'Unexpected response from extract API.',
        retryable: true,
      },
    });
  }

  if (!parsed.data.ok) {
    throw new ExtractHttpError(res.status, parsed.data);
  }

  return parsed.data.data;
}
