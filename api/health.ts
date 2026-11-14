// Deploy smoke test. Reports configuration, never key values.
import { LlmError, resolveProvider } from './_lib/llm';

export default function handler(_req: Request): Response {
  let provider: string | null = null;
  let model: string | null = null;
  let configError: string | null = null;
  try {
    ({ name: provider, model } = resolveProvider());
  } catch (err) {
    configError = err instanceof LlmError ? err.message : 'Unknown configuration error';
  }
  return Response.json({
    ok: true,
    data: {
      mockAi: process.env.MOCK_AI === '1',
      provider,
      model,
      configError,
      keys: { gemini: Boolean(process.env.GEMINI_API_KEY), claude: Boolean(process.env.ANTHROPIC_API_KEY) },
    },
  });
}
