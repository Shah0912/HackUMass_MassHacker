import type { Member, Project, Task, TaskStatus } from '@/core/types';

const COLORS = ['#2563eb', '#16a34a', '#ca8a04', '#db2777'];

export function member(id: string, name: string, hoursPerDay = 4): Member {
  const idx = Number(id.replace(/\D/g, '')) || 1;
  return { id, name, hoursPerDay, color: COLORS[(idx - 1) % COLORS.length]! };
}

export function task(
  id: string,
  opts: {
    title?: string;
    ownerId?: string | null;
    estimateHours?: number;
    status?: TaskStatus;
    dependsOn?: string[];
    source?: 'ai' | 'user';
  } = {},
): Task {
  return {
    id,
    title: opts.title ?? `Do ${id}`,
    ownerId: opts.ownerId === undefined ? 'm1' : opts.ownerId,
    estimateHours: opts.estimateHours ?? 2,
    status: opts.status ?? 'todo',
    dependsOn: opts.dependsOn ?? [],
    source: opts.source ?? 'user',
  };
}

export function project(partial: {
  tasks: Task[];
  members?: Member[];
  deadline?: string;
  workHoursPerDay?: number;
  name?: string;
}): Project {
  const nowIso = '2026-11-14T12:00:00.000Z';
  return {
    schemaVersion: 1,
    id: 'test-project',
    name: partial.name ?? 'Test',
    deadline: partial.deadline ?? '2026-11-16T12:00:00.000Z',
    workHoursPerDay: partial.workHoursPerDay ?? 6,
    members: partial.members ?? [member('m1', 'Alex'), member('m2', 'Jordan')],
    tasks: partial.tasks,
    rawInput: '',
    openQuestions: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Fixed "now" for deterministic tests. */
export const NOW = new Date('2026-11-14T12:00:00.000Z');
