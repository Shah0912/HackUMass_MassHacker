// Response helpers for the { ok, data } / { ok: false, error } envelope.
import { ERROR_HTTP, type ApiErrorCode } from '../../src/ai/contracts';
import { LlmError } from './llm';

export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data });
}

export function fail(code: ApiErrorCode, message: string, retryable: boolean): Response {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status: ERROR_HTTP[code] });
}

const PLAIN: Record<string, string> = {
  MODEL_REFUSED: "The AI couldn't process this text. Try editing it or use the sample.",
  MODEL_INVALID_OUTPUT: 'The AI returned something we could not read. Try again.',
  RATE_LIMITED: 'The AI service is busy. Wait a moment and try again.',
  UPSTREAM_ERROR: 'The AI service had a problem. Your text is safe; try again.',
  TIMEOUT: 'The AI took too long. Try again, or shorten the text.',
  AI_NOT_CONFIGURED: 'The AI service is not set up on the server (missing or invalid API key).',
};

/** Map any thrown error to an envelope response. Logs the code only, never input text (N-04). */
export function failFromError(err: unknown, endpoint: string): Response {
  if (err instanceof LlmError) {
    console.error(JSON.stringify({ endpoint, error: err.code }));
    return fail(err.code, PLAIN[err.code] ?? err.message, err.retryable);
  }
  console.error(JSON.stringify({ endpoint, error: 'UNEXPECTED', name: err instanceof Error ? err.name : typeof err }));
  return fail('UPSTREAM_ERROR', PLAIN.UPSTREAM_ERROR!, true);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
