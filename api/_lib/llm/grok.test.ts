import { describe, expect, it } from 'vitest';
import { createGrokProvider } from './grok';
import type { JsonCallRequest } from './types';

const req = (): JsonCallRequest => ({
  system: 'sys',
  user: '<project_text>notes</project_text>',
  schema: { type: 'object', properties: {}, additionalProperties: false },
  maxOutputTokens: 1000,
  effort: 'medium',
  signal: new AbortController().signal,
});

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

const okBody = {
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] },
  ],
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe('createGrokProvider', () => {
  it('sends a Responses API request with the system prompt, schema and effort, and reads the text', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const p = createGrokProvider('key', 'grok-4.7', fakeFetch(200, okBody, seen));
    const r = await p.callJson(req());
    expect(r).toMatchObject({ text: '{"a":1}', provider: 'grok', model: 'grok-4.7', usage: { inputTokens: 10, outputTokens: 5 } });

    expect(seen.url).toBe('https://api.x.ai/v1/responses');
    expect((seen.init!.headers as Record<string, string>).authorization).toBe('Bearer key');
    const sent = JSON.parse(String(seen.init!.body));
    expect(sent).toMatchObject({
      model: 'grok-4.7',
      instructions: 'sys',
      input: '<project_text>notes</project_text>',
      max_output_tokens: 1000,
      reasoning: { effort: 'medium' },
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    // Pasted text never goes in the system prompt.
    expect(sent.instructions).not.toContain('project_text');
  });

  it('maps truncation, refusal and empty output', async () => {
    await expect(createGrokProvider('k', 'm', fakeFetch(200, { ...okBody, status: 'incomplete' })).callJson(req())).rejects.toMatchObject({
      code: 'MODEL_INVALID_OUTPUT',
      retryable: true,
    });
    const refusal = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] };
    await expect(createGrokProvider('k', 'm', fakeFetch(200, refusal)).callJson(req())).rejects.toMatchObject({ code: 'MODEL_REFUSED' });
    await expect(createGrokProvider('k', 'm', fakeFetch(200, { status: 'completed', output: [] })).callJson(req())).rejects.toMatchObject({
      code: 'MODEL_INVALID_OUTPUT',
    });
  });

  it('maps HTTP errors', async () => {
    const call = (status: number) => createGrokProvider('k', 'm', fakeFetch(status, { error: { message: 'bad' } })).callJson(req());
    await expect(call(401)).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', retryable: false });
    await expect(call(429)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    await expect(call(400)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', retryable: false, message: expect.stringContaining('bad') });
    await expect(call(503)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', retryable: true });
  });

  it('maps an aborted request to TIMEOUT', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const failing = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    await expect(createGrokProvider('k', 'm', failing).callJson({ ...req(), signal: ctrl.signal })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
