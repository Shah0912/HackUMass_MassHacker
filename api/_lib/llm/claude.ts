import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type JsonCallRequest, type JsonCallResult, type LlmProvider } from './types';

export function createClaudeProvider(apiKey: string, model: string): LlmProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  return {
    name: 'claude',
    model,
    async callJson(req: JsonCallRequest): Promise<JsonCallResult> {
      let msg: Anthropic.Message;
      try {
        msg = await client.messages.create(
          {
            model,
            max_tokens: req.maxOutputTokens,
            // Fixed text first with cache_control so repeated calls reuse it.
            system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: req.user }],
            output_config: {
              ...(req.effort ? { effort: req.effort } : {}),
              format: { type: 'json_schema', schema: req.schema },
            },
          },
          { signal: req.signal },
        );
      } catch (err) {
        throw mapClaudeError(err, req.signal);
      }

      if (msg.stop_reason === 'refusal') {
        throw new LlmError('MODEL_REFUSED', 'The model declined this input.', false);
      }
      if (msg.stop_reason === 'max_tokens' || msg.stop_reason === 'model_context_window_exceeded') {
        throw new LlmError('MODEL_INVALID_OUTPUT', 'The model ran out of output space.', true);
      }
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (!text) throw new LlmError('MODEL_INVALID_OUTPUT', 'The model returned no text.', true);

      return {
        text,
        provider: 'claude',
        model,
        usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      };
    },
  };
}

function mapClaudeError(err: unknown, signal: AbortSignal): LlmError {
  if (signal.aborted || err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', 'The AI service took too long.', true);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError('RATE_LIMITED', 'The AI service is busy. Try again shortly.', true);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('AI_NOT_CONFIGURED', 'The Claude API key was rejected.', false);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new LlmError('UPSTREAM_ERROR', `Claude rejected the request: ${err.message}`, false);
  }
  return new LlmError('UPSTREAM_ERROR', 'Could not reach the AI service.', true);
}
