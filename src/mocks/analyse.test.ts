import { describe, expect, it } from 'vitest';
import type { Project, Task } from '@/core/types';
import { analyse, validate } from './analyse';
import { buildSampleProject } from './sampleProject';

const NOW = new Date('2026-11-14T12:00:00Z');

describe('sample project (gold standard for the demo)', () => {
  const p = buildSampleProject(NOW);
  const a = analyse(p, NOW);

  it('has no unfinished task over 4 h', () => {
    expect(p.tasks.filter((t) => t.status !== 'done' && t.estimateHours > 4)).toEqual([]);
  });

  it('is valid and late by about 6 h', () => {
    expect(a.valid).toBe(true);
    expect(a.verdict).toBe('late');
    expect(a.durationHours).toBe(17.5);
    expect(a.availableHours).toBeCloseTo(11.5, 5);
    expect(a.bufferHours).toBeCloseTo(-6, 5);
  });

  it('has the schema task as the bottleneck, blocking 13 tasks', () => {
    expect(a.bottleneckTaskId).toBe('t2');
    expect(a.tasks.t2!.downstreamCount).toBe(13);
    expect(a.criticalPath).toEqual(['t2', 't4', 't8', 't9', 't12', 't14', 't15']);
  });

  it('flags Sam as overloaded and leads with late, then overload and bottleneck', () => {
    expect(a.members.m1!.loadRatio).toBeGreaterThan(1);
    const kinds = a.risks.map((r) => r.kind);
    expect(kinds[0]).toBe('late');
    expect(kinds[1]).toBe('person_overload');
    expect(a.risks[1]!.memberIds).toContain('m1');
    expect(kinds).toContain('task_bottleneck');
    expect(a.risks.length).toBeLessThanOrEqual(5);
  });

  it('suggests a cut that actually wins back time', () => {
    const late = a.risks.find((r) => r.kind === 'late')!;
    expect(late.suggestion?.kind).toBe('cut');
    expect(late.suggestion!.bufferGainHours!).toBeGreaterThan(0);
  });
});

const proj = (tasks: Partial<Task>[]): Project => ({
  ...buildSampleProject(NOW),
  members: [],
  tasks: tasks.map((t, i) => ({ id: `t${i + 1}`, title: `Do ${i + 1}`, ownerId: null, estimateHours: 1, status: 'todo', dependsOn: [], source: 'user', ...t })),
});

describe('validation', () => {
  it('reports one CYCLE naming the loop in order', () => {
    const p = proj([{ dependsOn: ['t3'] }, { dependsOn: ['t1'] }, { dependsOn: ['t2'] }]);
    const cycles = validate(p).filter((i) => i.code === 'CYCLE');
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.taskIds).toEqual(['t1', 't2', 't3']);
    expect(analyse(p, NOW).valid).toBe(false);
  });

  it('detects unknown and self dependencies and bad estimates', () => {
    const codes = validate(proj([{ dependsOn: ['t9'] }, { dependsOn: ['t2'] }, { estimateHours: 0 }])).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['UNKNOWN_DEPENDENCY', 'SELF_DEPENDENCY', 'BAD_ESTIMATE']));
  });

  it('keeps dependents connected when a task is cut', () => {
    const p = proj([{ estimateHours: 2 }, { dependsOn: ['t1'], estimateHours: 3, cut: true }, { dependsOn: ['t2'], estimateHours: 4 }]);
    const a = analyse(p, NOW);
    expect(a.criticalPath).toEqual(['t1', 't3']);
    expect(a.durationHours).toBe(6);
  });
});
