import Anthropic from '@anthropic-ai/sdk';
import { APIConnectionTimeoutError, APIUserAbortError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  extractInputSchema,
  extractModelOutputSchema,
  type ApiError,
  type ExtractErrorCode,
  type ExtractInput,
  type ExtractResponse,
} from '@/ai/contracts';
import { modelOutputToProject } from '@/ai/postprocess';
import { buildExtractUserMessage, EXTRACT_SYSTEM_PROMPT } from '@/ai/prompt';
import type { Project } from '@/core/types';
import extractFixture from '../../fixtures/extract-response.json';

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 8000;
const TIMEOUT_MS = 60_000;

function err(
  code: ExtractErrorCode,
  message: string,
  retryable: boolean,
): ApiError {
  return { ok: false, error: { code, message, retryable } };
}

export function httpStatusFor(code: ExtractErrorCode): number {
  switch (code) {
    case 'INPUT_TOO_LONG':
      return 413;
    case 'INPUT_INVALID':
      return 400;
    case 'MODEL_REFUSED':
      return 422;
    case 'MODEL_INVALID_OUTPUT':
      return 502;
    case 'TIMEOUT':
      return 504;
    case 'UPSTREAM_ERROR':
    default:
      return 502;
  }
}

export function loadMockProject(): Project {
  const envelope = extractFixture as ExtractResponse | { ok: true; data: Project };
  if ('ok' in envelope && envelope.ok) return envelope.data;
  return envelope as unknown as Project;
}

/** Shared extract implementation for the API route (and tests). */
export async function runExtract(
  rawBody: unknown,
  env: { mockAi: boolean; apiKey: string | undefined },
): Promise<{ status: number; body: ExtractResponse | ApiError }> {
  if (typeof rawBody !== 'object' || rawBody === null) {
    const body = err('INPUT_INVALID', 'Request body must be a JSON object.', false);
    return { status: httpStatusFor(body.error.code), body };
  }

  const text = (rawBody as { text?: unknown }).text;
  if (typeof text === 'string' && text.length > 30_000) {
    const body = err('INPUT_TOO_LONG', 'Text must be at most 30,000 characters.', false);
    return { status: httpStatusFor(body.error.code), body };
  }

  const parsed = extractInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    const body = err('INPUT_INVALID', 'Request failed schema validation.', false);
    return { status: httpStatusFor(body.error.code), body };
  }

  const input: ExtractInput = {
    text: parsed.data.text,
    deadline: parsed.data.deadline,
    workHoursPerDay: parsed.data.workHoursPerDay,
    members: parsed.data.members,
  };

  if (env.mockAi) {
    const data = loadMockProject();
    const project: Project = {
      ...data,
      deadline: input.deadline,
      workHoursPerDay: input.workHoursPerDay,
      rawInput: input.text || data.rawInput,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    return { status: 200, body: { ok: true, data: project } };
  }

  if (!env.apiKey) {
    const body = err('UPSTREAM_ERROR', 'ANTHROPIC_API_KEY is not configured.', true);
    return { status: httpStatusFor(body.error.code), body };
  }

  const client = new Anthropic({ apiKey: env.apiKey });
  const started = Date.now();

  try {
    const message = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildExtractUserMessage(input) }],
        output_config: {
          format: zodOutputFormat(extractModelOutputSchema),
          effort: 'medium',
        },
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const latencyMs = Date.now() - started;
    // Logs: tokens, latency, stop_reason only — never raw text (N-04).
    console.info('[extract]', {
      latencyMs,
      stop_reason: message.stop_reason,
      input_tokens: message.usage?.input_tokens,
      output_tokens: message.usage?.output_tokens,
    });

    if (message.stop_reason === 'refusal') {
      const body = err('MODEL_REFUSED', 'The model refused to process this input.', false);
      return { status: httpStatusFor(body.error.code), body };
    }
    if (message.stop_reason === 'max_tokens') {
      const body = err('MODEL_INVALID_OUTPUT', 'The model hit the token limit.', true);
      return { status: httpStatusFor(body.error.code), body };
    }

    const modelOut = message.parsed_output;
    if (!modelOut) {
      const body = err('MODEL_INVALID_OUTPUT', 'Model returned no structured output.', true);
      return { status: httpStatusFor(body.error.code), body };
    }

    const checked = extractModelOutputSchema.safeParse(modelOut);
    if (!checked.success) {
      const body = err('MODEL_INVALID_OUTPUT', 'Model output failed schema validation.', true);
      return { status: httpStatusFor(body.error.code), body };
    }

    const project = modelOutputToProject(checked.data, input);
    return { status: 200, body: { ok: true, data: project } };
  } catch (e) {
    if (e instanceof APIUserAbortError || e instanceof APIConnectionTimeoutError) {
      const body = err('TIMEOUT', 'Extraction timed out after 60 seconds.', true);
      return { status: httpStatusFor(body.error.code), body };
    }
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      const body = err('TIMEOUT', 'Extraction timed out after 60 seconds.', true);
      return { status: httpStatusFor(body.error.code), body };
    }
    console.info('[extract]', {
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.name : 'unknown',
    });
    const body = err('UPSTREAM_ERROR', 'Upstream model request failed.', true);
    return { status: httpStatusFor(body.error.code), body };
  }
}
