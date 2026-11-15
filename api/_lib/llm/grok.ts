// xAI Grok adapter. Calls the Responses API (POST https://api.x.ai/v1/responses) with plain fetch,
// per docs.x.ai (checked 2026-11-15): system prompt in `instructions`, structured output via
// text.format { type: 'json_schema', name, schema, strict: true }, text in
// output[type=message].content[type=output_text].text, status 'incomplete' = truncated.
import { LlmError, type JsonCallRequest, type JsonCallResult, type LlmProvider } from './types';

const ENDPOINT = 'https://api.x.ai/v1/responses';

interface ResponsesBody {
  status?: string;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function createGrokProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    name: 'grok',
    model,
    async callJson(req: JsonCallRequest): Promise<JsonCallResult> {
      let res: Response;
      try {
        res = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            instructions: req.system,
            input: req.user,
            text: { format: { type: 'json_schema', name: 'result', schema: req.schema, strict: true } },
            max_output_tokens: req.maxOutputTokens,
            // Grok reasoning models default to 'high', which is slow; keep it explicit.
            reasoning: { effort: req.effort ?? 'low' },
            // Pasted notes are user data: don't keep them on xAI's side.
            store: false,
          }),
          signal: req.signal,
        });
      } catch (err) {
        if (req.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw new LlmError('TIMEOUT', 'The AI service took too long.', true);
        }
        throw new LlmError('UPSTREAM_ERROR', `Could not reach Grok: ${err instanceof Error ? err.message.slice(0, 200) : 'network error'}`, true);
      }

      if (!res.ok) throw await mapGrokError(res);

      let body: ResponsesBody;
      try {
        body = (await res.json()) as ResponsesBody;
      } catch {
        throw new LlmError('UPSTREAM_ERROR', 'Grok returned an unreadable response.', true);
      }
      if (body.status === 'incomplete') {
        throw new LlmError('MODEL_INVALID_OUTPUT', 'The model ran out of output space.', true);
      }
      // Skip reasoning items; take the message's text parts.
      const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
      if (parts.some((c) => c.type === 'refusal')) {
        throw new LlmError('MODEL_REFUSED', 'The model declined this input.', false);
      }
      const text = parts
        .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('');
      if (!text) throw new LlmError('MODEL_INVALID_OUTPUT', 'The model returned no text.', true);

      return {
        text,
        provider: 'grok',
        model,
        usage: { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null },
      };
    },
  };
}

// xAI documents 400 and 429 but not the error body, so read the message defensively.
async function mapGrokError(res: Response): Promise<LlmError> {
  let detail = '';
  try {
    const b = (await res.json()) as { error?: unknown; message?: unknown; code?: unknown };
    const e = b.error;
    detail = String(
      (typeof e === 'object' && e && 'message' in e ? (e as { message: unknown }).message : e) ?? b.message ?? '',
    ).slice(0, 300);
  } catch {
    /* no JSON body */
  }
  const s = res.status;
  if (s === 429) return new LlmError('RATE_LIMITED', 'The AI service is busy. Try again shortly.', true);
  if (s === 401 || s === 403) return new LlmError('AI_NOT_CONFIGURED', 'The xAI API key was rejected.', false);
  if (s === 400 || s === 404 || s === 422) return new LlmError('UPSTREAM_ERROR', `Grok rejected the request: ${detail || s}`, false);
  return new LlmError('UPSTREAM_ERROR', `Grok error ${s}${detail ? `: ${detail}` : ''}`, s >= 500);
}
