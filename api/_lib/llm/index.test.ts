import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateJson, LlmError, resolveProvider, toProviderSchema } from './index';
import type { LlmProvider } from './types';

describe('resolveProvider', () => {
  it('uses AI_PROVIDER when set', () => {
    const p = resolveProvider({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' });
    expect(p).toMatchObject({ name: 'claude', model: 'claude-opus-5-5', apiKey: 'a' });
  });

  it('falls back to whichever key exists, Gemini first', () => {
    expect(resolveProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }).name).toBe('gemini');
    expect(resolveProvider({ ANTHROPIC_API_KEY: 'a' }).name).toBe('claude');
    expect(resolveProvider({ AI_PROVIDER: '', ANTHROPIC_API_KEY: 'a' }).name).toBe('claude');
  });

  it('supports Grok via AI_PROVIDER or as the last fallback', () => {
    expect(resolveProvider({ AI_PROVIDER: 'grok', XAI_API_KEY: 'x', GEMINI_API_KEY: 'g' })).toMatchObject({
      name: 'grok',
      model: 'grok-4.3',
      apiKey: 'x',
    });
    expect(resolveProvider({ XAI_API_KEY: 'x' }).name).toBe('grok');
    expect(resolveProvider({ XAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'a' }).name).toBe('claude');
    expect(resolveProvider({ XAI_API_KEY: 'x', GROK_MODEL: 'grok-4.7' }).model).toBe('grok-4.7');
    expect(() => resolveProvider({ AI_PROVIDER: 'grok', GEMINI_API_KEY: 'g' })).toThrow(/XAI_API_KEY/);
  });

  it('honours model overrides', () => {
    expect(resolveProvider({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-x' }).model).toBe('gemini-x');
    expect(resolveProvider({ ANTHROPIC_API_KEY: 'a', CLAUDE_MODEL: 'claude-x' }).model).toBe('claude-x');
  });

  it('errors clearly when not configured', () => {
    expect(() => resolveProvider({})).toThrow(LlmError);
    expect(() => resolveProvider({ AI_PROVIDER: 'claude', GEMINI_API_KEY: 'g' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => resolveProvider({ AI_PROVIDER: 'openai', GEMINI_API_KEY: 'g' })).toThrow(/AI_PROVIDER/);
  });
});

describe('toProviderSchema', () => {
  it('closes every object and drops $schema', () => {
    const s = toProviderSchema(z.object({ a: z.array(z.object({ b: z.string().nullable() })) }));
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBe(false);
    const item = (s.properties as { a: { items: Record<string, unknown> } }).a.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(['b']);
  });
});

const fake = (text: string): LlmProvider => ({
  name: 'gemini',
  model: 'fake',
  callJson: async () => ({ text, provider: 'gemini', model: 'fake', usage: { inputTokens: 1, outputTokens: 1 } }),
});
const Out = z.object({ n: z.number() });

describe('generateJson', () => {
  it('parses and validates output', async () => {
    const r = await generateJson(Out, { system: 's', user: 'u', provider: fake('{"n":3}') });
    expect(r.data.n).toBe(3);
  });

  it('maps malformed or invalid output to MODEL_INVALID_OUTPUT', async () => {
    await expect(generateJson(Out, { system: 's', user: 'u', provider: fake('not json') })).rejects.toMatchObject({
      code: 'MODEL_INVALID_OUTPUT',
    });
    await expect(generateJson(Out, { system: 's', user: 'u', provider: fake('{"n":"x"}') })).rejects.toMatchObject({
      code: 'MODEL_INVALID_OUTPUT',
    });
  });
});
