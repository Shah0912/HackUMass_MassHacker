import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectSchema } from '@/core/schemas';
import type { Analysis, Project } from '@/core/types';
import { extractApiResponseSchema } from '@/ai/contracts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

/** Compile-time + runtime check that Analysis fixture matches the frozen shape. */
function assertAnalysis(value: Analysis): Analysis {
  return value;
}

describe('frozen fixtures', () => {
  it('sample-project.json matches Project schema', () => {
    const parsed = projectSchema.parse(readJson('fixtures/sample-project.json'));
    expect(parsed.tasks.length).toBeGreaterThanOrEqual(10);
    expect(parsed.members.length).toBeGreaterThanOrEqual(3);
    const bottleneck = parsed.tasks.find((t) => t.id === 't1');
    expect(bottleneck?.status).toBe('todo');
  });

  it('sample-analysis.json matches Analysis shape', () => {
    const analysis = assertAnalysis(readJson('fixtures/sample-analysis.json') as Analysis);
    expect(analysis.valid).toBe(true);
    expect(analysis.verdict).toBe('late');
    expect(analysis.bottleneckTaskId).toBe('t1');
    expect(analysis.risks).toHaveLength(3);
    expect(analysis.bufferHours).toBeLessThan(0);
  });

  it('extract-response.json is a successful API envelope with Project data', () => {
    const envelope = extractApiResponseSchema.parse(readJson('fixtures/extract-response.json'));
    expect(envelope.ok).toBe(true);
    if (envelope.ok) {
      const project: Project = envelope.data;
      expect(project.schemaVersion).toBe(1);
      expect(project.tasks.length).toBeGreaterThan(0);
    }
  });
});
