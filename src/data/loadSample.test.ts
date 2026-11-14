import { describe, expect, it } from 'vitest';
import { analyse } from '@/core/analyse';
import { loadSampleProject } from '@/data/loadSample';

describe('loadSampleProject', () => {
  it('keeps a late verdict after shifting the deadline to now', () => {
    const now = new Date('2026-12-01T12:00:00-05:00');
    const project = loadSampleProject(now);
    const analysis = analyse(project, now);
    expect(analysis.valid).toBe(true);
    expect(analysis.verdict).toBe('late');
    expect(analysis.bottleneckTaskId).toBe('t1');
    expect(new Date(project.deadline).getTime()).toBeGreaterThan(now.getTime());
  });
});
