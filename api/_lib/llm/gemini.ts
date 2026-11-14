import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { LlmError, type JsonCallRequest, type JsonCallResult, type LlmProvider } from './types';

const REFUSAL_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    name: 'gemini',
    model,
    async callJson(req: JsonCallRequest): Promise<JsonCallResult> {
      let res;
      try {
        res = await ai.models.generateContent({
          model,
          contents: req.user,
          config: {
            systemInstruction: req.system,
            responseMimeType: 'application/json',
            responseJsonSchema: req.schema,
            maxOutputTokens: req.maxOutputTokens,
            abortSignal: req.signal,
          },
        });
      } catch (err) {
        throw mapGeminiError(err, req.signal);
      }

      if (res.promptFeedback?.blockReason) {
        throw new LlmError('MODEL_REFUSED', 'The model declined this input.', false);
      }
      const finish = res.candidates?.[0]?.finishReason;
      if (finish && REFUSAL_REASONS.has(finish)) {
        throw new LlmError('MODEL_REFUSED', 'The model declined this input.', false);
      }
      if (finish === FinishReason.MAX_TOKENS) {
        throw new LlmError('MODEL_INVALID_OUTPUT', 'The model ran out of output space.', true);
      }
      const text = res.text;
      if (!text) throw new LlmError('MODEL_INVALID_OUTPUT', 'The model returned no text.', true);

      return {
        text,
        provider: 'gemini',
        model,
        usage: {
          inputTokens: res.usageMetadata?.promptTokenCount ?? null,
          outputTokens: res.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    },
  };
}

function mapGeminiError(err: unknown, signal: AbortSignal): LlmError {
  if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
    return new LlmError('TIMEOUT', 'The AI service took too long.', true);
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return new LlmError('RATE_LIMITED', 'The AI service is busy. Try again shortly.', true);
    if (err.status === 401 || err.status === 403) {
      return new LlmError('AI_NOT_CONFIGURED', 'The Gemini API key was rejected.', false);
    }
    if (err.status === 400) return new LlmError('UPSTREAM_ERROR', `Gemini rejected the request: ${err.message}`, false);
    return new LlmError('UPSTREAM_ERROR', `Gemini error ${err.status}: ${err.message.slice(0, 300)}`, err.status >= 500);
  }
  if (err instanceof Error) {
    return new LlmError('UPSTREAM_ERROR', `Could not reach Gemini: ${err.message.slice(0, 200)}`, true);
  }
  return new LlmError('UPSTREAM_ERROR', 'Could not reach the AI service.', true);
}
