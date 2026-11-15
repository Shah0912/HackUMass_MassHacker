import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { isOversized, MAX_TASK_HOURS, splitOversizedTasks, splitTask } from './split';

const t = (id: string, estimateHours: number, dependsOn: string[] = [], over: Partial<Task> = {}): Task => ({
  id,
  title: `Do ${id}`,
  ownerId: 'm1',
  estimateHours,
  status: 'todo',
  dependsOn,
  source: 'ai',
  ...over,
});

describe('splitTask', () => {
  it('splits a 10 h task into three chained parts of at most 4 h, keeping the total', () => {
    const { tasks, newIds } = splitTask([t('t1', 1), t('t2', 10, ['t1']), t('t3', 2, ['t2'])], 't2');
    expect(newIds).toEqual(['t4', 't5']);
    const parts = ['t2', 't4', 't5'].map((id) => tasks.find((x) => x.id === id)!);
    expect(parts.map((p) => p.estimateHours)).toEqual([3.25, 3.25, 3.5]);
    expect(parts.every((p) => p.estimateHours <= MAX_TASK_HOURS)).toBe(true);
    expect(parts.map((p) => p.dependsOn)).toEqual([['t1'], ['t2'], ['t4']]);
    expect(parts[0]!.title).toBe('Do t2 (part 1 of 3)');
    // The dependent now waits on the last part.
    expect(tasks.find((x) => x.id === 't3')!.dependsOn).toEqual(['t5']);
  });

  it('keeps only the first part in progress', () => {
    const { tasks } = splitTask([t('t1', 6, [], { status: 'in_progress' })], 't1');
    expect(tasks.map((x) => x.status)).toEqual(['in_progress', 'todo']);
  });

  it('leaves small, done and cut tasks alone', () => {
    const tasks = [t('t1', 4), t('t2', 9, [], { status: 'done' }), t('t3', 9, [], { cut: true })];
    expect(splitOversizedTasks(tasks)).toBe(tasks);
    expect(isOversized(t('x', 4.25))).toBe(true);
  });

  it('keeps titles within 80 characters and does not stack part suffixes', () => {
    const long = 'B'.repeat(80);
    const { tasks } = splitTask([t('t1', 8, [], { title: long })], 't1');
    expect(tasks.every((x) => x.title.length <= 80)).toBe(true);
    const again = splitTask([t('t1', 8, [], { title: 'Build API (part 1 of 2)' })], 't1');
    expect(again.tasks[0]!.title).toBe('Build API (part 1 of 2)');
  });

  it('splits every oversized task', () => {
    const out = splitOversizedTasks([t('t1', 5), t('t2', 8, ['t1'])]);
    expect(out).toHaveLength(4);
    expect(out.every((x) => x.estimateHours <= MAX_TASK_HOURS)).toBe(true);
  });
});
