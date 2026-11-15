import { describe, expect, it } from 'vitest';
import type { Project } from '@/core/types';
import { LIMITS } from '@/core/types';
import { addMember, removeMember, updateMember, updateTask } from './taskOps';

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
