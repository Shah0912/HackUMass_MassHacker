// Pure edits on a Project. Every user edit marks the task source 'user' (F-03).
import type { Member, Project, Task } from '@/core/types';
import { LIMITS, MEMBER_COLORS, memberColor } from '@/core/types';
import { byId } from '@/engine';
import { splitTask } from '@/core/split';

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export function updateTask(p: Project, id: string, patch: Partial<Task>): Project {
  return touch({
    ...p,
    tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch, source: 'user' } : t)),
    // Giving a task an owner answers its open "who owns this?" question.
    openQuestions: patch.ownerId
      ? p.openQuestions.map((q) => (q.taskId === id && q.field === 'owner' ? { ...q, dismissed: true } : q))
      : p.openQuestions,
  });
}

export function deleteTask(p: Project, id: string): Project {
  return touch({
    ...p,
    tasks: p.tasks.filter((t) => t.id !== id).map((t) => (t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) } : t)),
    openQuestions: p.openQuestions.filter((q) => q.taskId !== id),
  });
}

export function nextTaskId(p: Project): string {
  const max = Math.max(0, ...p.tasks.map((t) => Number(/^t(\d+)$/.exec(t.id)?.[1] ?? 0)));
  return `t${max + 1}`;
}

export function addTask(p: Project): { project: Project; id: string } {
  const id = nextTaskId(p);
  const task: Task = { id, title: '', ownerId: null, estimateHours: 1, status: 'todo', dependsOn: [], source: 'user' };
  return { project: touch({ ...p, tasks: [...p.tasks, task] }), id };
}

/** Upstream (transitive dependencies) and downstream (transitive dependents) of a task. */
export function relatedTasks(p: Project, id: string): { upstream: Set<string>; downstream: Set<string> } {
  const deps = new Map(p.tasks.map((t) => [t.id, t.dependsOn]));
  const dependents = new Map<string, string[]>();
  for (const t of p.tasks) for (const d of t.dependsOn) dependents.set(d, [...(dependents.get(d) ?? []), t.id]);
  const walk = (start: string, next: (x: string) => string[]) => {
    const seen = new Set<string>();
    const stack = [...next(start)];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x) || x === start) continue;
      seen.add(x);
      stack.push(...next(x));
    }
    return seen;
  };
  return { upstream: walk(id, (x) => deps.get(x) ?? []), downstream: walk(id, (x) => dependents.get(x) ?? []) };
}

export const sortedTasks = (p: Project) => [...p.tasks].sort((a, b) => byId(a.id, b.id));

// ---------------- Members (people can be added after extraction if the AI missed someone) ----------------

export const findMemberByName = (p: Project, name: string): Member | undefined => {
  const n = name.trim().toLowerCase();
  return p.members.find((m) => m.name.trim().toLowerCase() === n);
};

/** Add a person, or return the existing one with that name (case-insensitive). No-op past the member limit. */
export function addMember(p: Project, name: string, hoursPerDay = 4): { project: Project; id: string | null } {
  const clean = name.trim().slice(0, 60);
  if (!clean) return { project: p, id: null };
  const existing = findMemberByName(p, clean);
  if (existing) return { project: p, id: existing.id };
  if (p.members.length >= LIMITS.maxMembers) return { project: p, id: null };
  const max = Math.max(0, ...p.members.map((m) => Number(/^m(\d+)$/.exec(m.id)?.[1] ?? 0)));
  const usedColors = new Set(p.members.map((m) => m.color));
  const color = MEMBER_COLORS.find((c) => !usedColors.has(c)) ?? memberColor(p.members.length);
  const member: Member = { id: `m${max + 1}`, name: clean, hoursPerDay: Math.min(24, Math.max(0, hoursPerDay)), color };
  return { project: touch({ ...p, members: [...p.members, member] }), id: member.id };
}

export function updateMember(p: Project, id: string, patch: Partial<Pick<Member, 'name' | 'hoursPerDay'>>): Project {
  const next = { ...patch };
  if (next.name !== undefined) next.name = next.name.slice(0, 60);
  if (next.hoursPerDay !== undefined) next.hoursPerDay = Number.isFinite(next.hoursPerDay) ? Math.min(24, Math.max(0, next.hoursPerDay)) : 0;
  return touch({ ...p, members: p.members.map((m) => (m.id === id ? { ...m, ...next } : m)) });
}

/** Remove a person; their tasks become unassigned (edits marked as the user's). */
export function removeMember(p: Project, id: string): Project {
  return touch({
    ...p,
    members: p.members.filter((m) => m.id !== id),
    tasks: p.tasks.map((t) => (t.ownerId === id ? { ...t, ownerId: null, source: 'user' } : t)),
  });
}

/** Break a task over the size limit into chained parts (see src/core/split). */
export function splitTaskInProject(p: Project, id: string): Project {
  const { tasks, newIds } = splitTask(p.tasks, id);
  if (newIds.length === 0) return p;
  const touched = new Set([id, ...newIds]);
  return touch({ ...p, tasks: tasks.map((t) => (touched.has(t.id) ? { ...t, source: 'user' } : t)) });
}
