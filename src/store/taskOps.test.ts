import { describe, expect, it } from 'vitest';
import type { Project } from '@/core/types';
import { LIMITS } from '@/core/types';
import { addMember, addTaskWith, removeMember, updateMember, updateTask, wouldCreateCycle } from './taskOps';

const base = (): Project => ({
  schemaVersion: 1,
  id: 'p',
  name: 'P',
  deadline: '2026-11-20T00:00:00Z',
  workHoursPerDay: 6,
  members: [{ id: 'm1', name: 'Sam', hoursPerDay: 4, color: '#2563eb' }],
  tasks: [
    { id: 't1', title: 'Do A', ownerId: 'm1', estimateHours: 2, status: 'todo', dependsOn: [], source: 'ai' },
    { id: 't2', title: 'Do B', ownerId: null, estimateHours: 2, status: 'todo', dependsOn: [], source: 'ai' },
  ],
  rawInput: '',
  openQuestions: [{ id: 'q1', taskId: 't2', field: 'owner', question: 'Who does B?', dismissed: false }],
  createdAt: '',
  updatedAt: '',
});

describe('member ops', () => {
  it('adds a person with the next id and an unused colour', () => {
    const { project, id } = addMember(base(), '  Jordan ', 5);
    expect(id).toBe('m2');
    expect(project.members[1]).toMatchObject({ id: 'm2', name: 'Jordan', hoursPerDay: 5 });
    expect(project.members[1]!.color).not.toBe('#2563eb');
  });

  it('returns the existing person for a same-name add and ignores blank names', () => {
    const p = base();
    expect(addMember(p, 'sam').id).toBe('m1');
    expect(addMember(p, 'sam').project.members).toHaveLength(1);
    expect(addMember(p, '   ').id).toBeNull();
  });

  it('stops at the member limit', () => {
    let p = base();
    for (let i = 0; i < LIMITS.maxMembers + 3; i++) p = addMember(p, `P${i}`).project;
    expect(p.members).toHaveLength(LIMITS.maxMembers);
  });

  it('removing a person unassigns their tasks', () => {
    const p = removeMember(base(), 'm1');
    expect(p.members).toHaveLength(0);
    expect(p.tasks[0]).toMatchObject({ ownerId: null, source: 'user' });
  });

  it('clamps hours per day', () => {
    expect(updateMember(base(), 'm1', { hoursPerDay: 40 }).members[0]!.hoursPerDay).toBe(24);
    expect(updateMember(base(), 'm1', { hoursPerDay: Number.NaN }).members[0]!.hoursPerDay).toBe(0);
  });

  it('assigning an owner answers the open owner question', () => {
    const { project, id } = addMember(base(), 'Jordan');
    const p = updateTask(project, 't2', { ownerId: id });
    expect(p.tasks[1]!.ownerId).toBe('m2');
    expect(p.openQuestions[0]!.dismissed).toBe(true);
  });
});

describe('adding a task from the graph', () => {
  // t1 → t2 → t3 (t3 waits on t2, which waits on t1).
  const chain = (): Project => {
    const p = base();
    return { ...p, tasks: [...p.tasks.map((t) => (t.id === 't2' ? { ...t, dependsOn: ['t1'] } : t)), { id: 't3', title: 'Do C', ownerId: null, estimateHours: 1, status: 'todo', dependsOn: ['t2'], source: 'ai' }] };
  };

  it('adds a task between two others and rewires what it unlocks', () => {
    const { project, id } = addTaskWith(chain(), { title: '  Review B ', ownerId: 'm1', estimateHours: 1.1, dependsOn: ['t2', 'ghost'], unlocks: ['t3'] });
    expect(id).toBe('t4');
    const t4 = project.tasks.find((t) => t.id === 't4')!;
    expect(t4).toMatchObject({ title: 'Review B', ownerId: 'm1', estimateHours: 1, status: 'todo', dependsOn: ['t2'], source: 'user' });
    expect(project.tasks.find((t) => t.id === 't3')).toMatchObject({ dependsOn: ['t2', 't4'], source: 'user' });
  });

  it('drops an unknown owner and splits a task over 4 h, with unlocked tasks waiting on the last part', () => {
    const { project } = addTaskWith(chain(), { title: 'Big job', ownerId: 'm9', estimateHours: 9, dependsOn: [], unlocks: ['t3'] });
    const parts = project.tasks.filter((t) => t.title.startsWith('Big job'));
    expect(parts).toHaveLength(3);
    expect(parts.every((t) => t.estimateHours <= 4 && t.ownerId === null)).toBe(true);
    const last = parts.find((t) => t.title.endsWith('(part 3 of 3)'))!;
    expect(project.tasks.find((t) => t.id === 't3')!.dependsOn).toEqual(['t2', last.id]);
  });

  it('spots a loop before it is made', () => {
    const p = chain();
    expect(wouldCreateCycle(p, ['t3'], ['t1'])).toBe(true); // t1 → … → t3 → new → t1
    expect(wouldCreateCycle(p, ['t2'], ['t2'])).toBe(true);
    expect(wouldCreateCycle(p, ['t1'], ['t3'])).toBe(false);
    expect(wouldCreateCycle(p, [], [])).toBe(false);
  });
});