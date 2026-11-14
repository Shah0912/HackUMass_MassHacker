import { z } from 'zod';

/**
 * Zod schema → JSON Schema that both providers accept:
 * strips $schema and sets additionalProperties: false on every object
 * (required by Claude structured outputs, harmless for Gemini).
 */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete json.$schema;
  return closeObjects(json) as Record<string, unknown>;
}

function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = closeObjects(v);
  if (out.type === 'object' || 'properties' in out) out.additionalProperties = false;
  return out;
}
