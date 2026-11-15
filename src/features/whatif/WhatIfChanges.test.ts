import { describe, expect, it } from 'vitest';
import type { Project, Task } from '@/core/types';
import { analyse } from '@/mocks/analyse';
import { updateTask } from '@/store/taskOps';
import { diffProjects } from './WhatIfChanges';

const NOW = new Date('2026-11-14T12:00:00Z');

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Design the schema',
    ownerId: 'm1',
    estimateHours: 3,
    status: 'todo',
    dependsOn: [],
    source: 'ai',
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: 'p',
    name: 'Campus Eats',
    deadline: '2026-11-16T18:00:00.000Z',
    workHoursPerDay: 6,
    members: [
      { id: 'm1', name: 'Sam', hoursPerDay: 4, color: '#000' },
      { id: 'm2', name: 'Priya', hoursPerDay: 4, color: '#111' },
    ],
    tasks: [task()],
    rawInput: '',
    openQuestions: [],
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    ...over,
  };
}

describe('diffProjects', () => {
  it('lists each what-if edit and undoes it on its own', () => {
    const base = project();
    const draft = project({
      tasks: [task({ ownerId: 'm2', estimateHours: 1, status: 'done', cut: true, source: 'user' })],
    });
    const changes = diffProjects(base, draft);
    expect(changes.map((c) => c.text)).toEqual([
      '"Design the schema": Sam → Priya',
      '"Design the schema": 3 h → 1 h',
      '"Design the schema": Not started → Done',
      'Cut "Design the schema"',
    ]);

    const undone = changes.reduceRight((current, change) => change.revert(current), draft);
    expect(undone.tasks[0]).toMatchObject({ ownerId: 'm1', estimateHours: 3, status: 'todo' });
    expect(undone.tasks[0]?.cut).toBeFalsy();
  });

  it('names a person who was added in the draft', () => {
    const base = project();
    const draft = project({
      members: [...base.members, { id: 'm3', name: 'Leo', hoursPerDay: 3, color: '#222' }],
      tasks: [task({ ownerId: 'm3' })],
    });
    const changes = diffProjects(base, draft);
    expect(changes.map((c) => c.text)).toContain('"Design the schema": Sam → Leo');
    expect(changes.map((c) => c.text)).toContain('Added Leo');

    const undone = changes.reduceRight((current, change) => change.revert(current), draft);
    expect(undone.members.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(undone.tasks[0]?.ownerId).toBe('m1');
  });

  it('does not list a drop onto the person who already owns the task', () => {
    const base = project();
    expect(diffProjects(base, updateTask(base, 't1', { ownerId: 'm1' }))).toEqual([]);
  });
});

describe('what-if draft', () => {
  it('reassigns a dropped task and undo puts the load back', () => {
    const base = project();
    const draft = updateTask(base, 't1', { ownerId: 'm2' });

    expect(base.tasks[0]?.ownerId).toBe('m1');
    expect(draft.tasks[0]).toMatchObject({ ownerId: 'm2', source: 'user' });
    expect(diffProjects(base, draft).map((c) => c.text)).toEqual(['"Design the schema": Sam → Priya']);

    const before = analyse(base, NOW);
    const after = analyse(draft, NOW);
    expect(before.members.m1?.remainingHours).toBe(3);
    expect(after.members.m1?.remainingHours).toBe(0);
    expect(after.members.m2?.remainingHours).toBe(3);

    const undone = diffProjects(base, draft)[0]!.revert(draft);
    expect(analyse(undone, NOW).members.m1?.remainingHours).toBe(3);
    expect(analyse(undone, NOW).members.m2?.remainingHours).toBe(0);
  });

  it('mark done clears the remaining hours on the draft only', () => {
    const base = project();
    const draft = updateTask(base, 't1', { status: 'done' });

    expect(base.tasks[0]?.status).toBe('todo');
    expect(analyse(base, NOW).tasks.t1?.remainingHours).toBe(3);
    expect(analyse(draft, NOW).tasks.t1?.remainingHours).toBe(0);
    expect(diffProjects(base, draft).map((c) => c.text)).toEqual(['"Design the schema": Not started → Done']);

    const undone = diffProjects(base, draft)[0]!.revert(draft);
    expect(undone.tasks[0]?.status).toBe('todo');
    expect(analyse(undone, NOW).tasks.t1?.remainingHours).toBe(3);
  });
});