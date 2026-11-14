import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyse } from '@/core/analyse';
import type { Project } from '@/core/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('sample-project gold standard', () => {
  it('is late with t1 bottleneck and overloaded Alex', () => {
    const project = JSON.parse(
      readFileSync(join(root, 'fixtures/sample-project.json'), 'utf8'),
    ) as Project;
    // Match the fixture deadline relative to a fixed "load" time.
    const now = new Date('2026-11-14T12:00:00-05:00');
    const analysis = analyse(project, now);

    expect(analysis.valid).toBe(true);
    expect(analysis.verdict).toBe('late');
    expect(analysis.criticalPath).toEqual(['t1', 't3', 't6', 't8', 't9', 't12']);
    expect(analysis.bottleneckTaskId).toBe('t1');
    expect(analysis.tasks.t1!.downstreamCount).toBeGreaterThanOrEqual(5);
    expect(analysis.members.m1!.loadRatio).toBeGreaterThan(1);
    expect(analysis.risks.map((r) => r.kind)).toEqual([
      'late',
      'person_overload',
      'task_bottleneck',
    ]);
  });
});
