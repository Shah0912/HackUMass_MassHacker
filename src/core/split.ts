// Task size rule: no task may be longer than MAX_TASK_HOURS. Pure (no React, network or clock);
// relative imports only, because api/ uses this too.
import type { Task } from './types';

export const MAX_TASK_HOURS = 4;

const PART = / \(part \d+ of \d+\)$/;

const nextIdFrom = (tasks: Task[]) => {
  let max = Math.max(0, ...tasks.map((t) => Number(/^t(\d+)$/.exec(t.id)?.[1] ?? 0)));
  return () => `t${++max}`;
};

/** True when a task still has to be split (done and cut tasks are left alone). */
export const isOversized = (t: Task, max = MAX_TASK_HOURS) => !t.cut && t.status !== 'done' && t.estimateHours > max;

/**
 * Split one task into ceil(estimate / max) chained parts of at most `max` hours each.
 * Part 1 keeps the task's id and dependencies; each later part depends on the one before;
 * tasks that depended on the original now depend on the last part.
 */
export function splitTask(tasks: Task[], id: string, max = MAX_TASK_HOURS): { tasks: Task[]; newIds: string[] } {
  const t = tasks.find((x) => x.id === id);
  if (!t || !isOversized(t, max)) return { tasks, newIds: [] };
  const n = Math.ceil(t.estimateHours / max);
  const nextId = nextIdFrom(tasks);
  const ids = [t.id, ...Array.from({ length: n - 1 }, nextId)];
  // Even quarter-hour parts; the last absorbs rounding so the total is unchanged.
  const each = Math.floor((t.estimateHours / n) * 4) / 4;
  const base = t.title.replace(PART, '');
  const parts: Task[] = ids.map((pid, i) => {
    const suffix = ` (part ${i + 1} of ${n})`;
    return {
      ...t,
      id: pid,
      title: base.slice(0, 80 - suffix.length).trimEnd() + suffix,
      estimateHours: i === n - 1 ? Math.round((t.estimateHours - each * (n - 1)) * 4) / 4 : each,
      status: i === 0 ? t.status : t.status === 'in_progress' ? 'todo' : t.status,
      dependsOn: i === 0 ? [...t.dependsOn] : [ids[i - 1]!],
    };
  });
  const last = ids[n - 1]!;
  const out: Task[] = [];
  for (const x of tasks) {
    if (x.id === id) out.push(...parts);
    else out.push(x.dependsOn.includes(id) ? { ...x, dependsOn: x.dependsOn.map((d) => (d === id ? last : d)) } : x);
  }
  return { tasks: out, newIds: ids.slice(1) };
}

/** Split every oversized task. Returns the original array when nothing needed splitting. */
export function splitOversizedTasks(tasks: Task[], max = MAX_TASK_HOURS): Task[] {
  let out = tasks;
  for (const t of tasks) if (isOversized(t, max)) out = splitTask(out, t.id, max).tasks;
  return out;
}
