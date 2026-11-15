// Pure edits on a Project. Every user edit marks the task source 'user' (F-03).
import type { Project, Task } from '@/core/types';
import { byId } from '@/engine';

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export function updateTask(p: Project, id: string, patch: Partial<Task>): Project {
  return touch({
    ...p,
    tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch, source: 'user' } : t)),
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
