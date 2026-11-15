// The one entry point endpoints use: generateJson(zodSchema, { system, user }).
// Provider is chosen by AI_PROVIDER ('gemini' | 'claude' | 'grok'); if unset, whichever key is
// present (Gemini, then Claude, then Grok). Switching providers needs no code change, only env vars.
import type { z } from 'zod';
import { createClaudeProvider } from './claude';
import { createGeminiProvider } from './gemini';
import { createGrokProvider } from './grok';
import { toProviderSchema } from './schema';
import { LlmError, type LlmProvider, type ProviderName } from './types';

export { LlmError } from './types';
export type { LlmErrorCode, LlmProvider, ProviderName } from './types';
export { toProviderSchema } from './schema';

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  claude: 'claude-opus-5-5',
  gemini: 'gemini-2.5-flash',
  grok: 'grok-4.3', // faster than grok-4.7 (about 20 s vs 60 s on the sample)
};

/** Env var names per provider. Order = fallback order when AI_PROVIDER is unset. */
const PROVIDERS: Record<ProviderName, { keyVar: string; modelVar: string }> = {
  gemini: { keyVar: 'GEMINI_API_KEY', modelVar: 'GEMINI_MODEL' },
  claude: { keyVar: 'ANTHROPIC_API_KEY', modelVar: 'CLAUDE_MODEL' },
  grok: { keyVar: 'XAI_API_KEY', modelVar: 'GROK_MODEL' },
};
const NAMES = Object.keys(PROVIDERS) as ProviderName[];

const TIMEOUT_MS = 60_000;

type Env = Record<string, string | undefined>;

export function resolveProvider(env: Env = process.env): { name: ProviderName; model: string; apiKey: string } {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase() || undefined;
  if (wanted && !NAMES.includes(wanted as ProviderName)) {
    throw new LlmError('AI_NOT_CONFIGURED', `AI_PROVIDER must be one of ${NAMES.join(', ')}; got "${wanted}".`, false);
  }
  const name = (wanted as ProviderName | undefined) ?? NAMES.find((n) => env[PROVIDERS[n].keyVar]) ?? null;
  if (!name) {
    throw new LlmError('AI_NOT_CONFIGURED', `No AI key set (${NAMES.map((n) => PROVIDERS[n].keyVar).join(', ')}).`, false);
  }
  const { keyVar, modelVar } = PROVIDERS[name];
  const apiKey = env[keyVar];
  if (!apiKey) throw new LlmError('AI_NOT_CONFIGURED', `AI_PROVIDER is "${name}" but ${keyVar} is not set.`, false);
  const model = env[modelVar]?.trim() || DEFAULT_MODELS[name];
  return { name, model, apiKey };
}

function createProvider(name: ProviderName, apiKey: string, model: string): LlmProvider {
  if (name === 'claude') return createClaudeProvider(apiKey, model);
  if (name === 'grok') return createGrokProvider(apiKey, model);
  return createGeminiProvider(apiKey, model);
}

let cached: { key: string; provider: LlmProvider } | null = null;

export function getProvider(env: Env = process.env): LlmProvider {
  const { name, model, apiKey } = resolveProvider(env);
  const key = `${name}:${model}:${apiKey}`;
  if (cached?.key !== key) {
    const provider = createProvider(name, apiKey, model);
    cached = { key, provider };
  }
  return cached.provider;
}

export interface GenerateJsonOptions {
  system: string;
  user: string;
  maxOutputTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  provider?: LlmProvider;
}

/** One structured call: model → JSON.parse → Zod validate. Throws LlmError on any failure. */
export async function generateJson<S extends z.ZodType>(
  schema: S,
  opts: GenerateJsonOptions,
): Promise<{ data: z.infer<S>; provider: ProviderName; model: string; latencyMs: number }> {
  const provider = opts.provider ?? getProvider();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await provider.callJson({
      system: opts.system,
      user: opts.user,
      schema: toProviderSchema(schema),
      maxOutputTokens: opts.maxOutputTokens ?? 8000,
      effort: opts.effort,
      signal: controller.signal,
    });
    let raw: unknown;
    try {
      raw = JSON.parse(res.text);
    } catch {
      throw new LlmError('MODEL_INVALID_OUTPUT', 'The model returned malformed JSON.', true);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? 'unknown';
      throw new LlmError('MODEL_INVALID_OUTPUT', `Output failed validation: ${first}`, true);
    }
    const latencyMs = Date.now() - started;
    // Log only metadata, never prompt or output text (N-04).
    console.info(JSON.stringify({ ai: res.provider, model: res.model, latencyMs, ...res.usage }));
    return { data: parsed.data, provider: res.provider, model: res.model, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
