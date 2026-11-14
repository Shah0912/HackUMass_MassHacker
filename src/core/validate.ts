import type { Project, Task, ValidationIssue } from '@/core/types';

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build adjacency: task → its dependencies (prerequisites). */
function depEdges(tasks: Task[]): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const task of tasks) {
    edges.set(task.id, [...task.dependsOn]);
  }
  return edges;
}

/**
 * Find simple cycles via DFS. Each cycle lists task IDs in loop order
 * (starting at the lowest ID for stability).
 */
function findCycles(tasks: Task[]): string[][] {
  const edges = depEdges(tasks);
  const ids = tasks.map((t) => t.id);
  const color = new Map<string, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  for (const id of ids) color.set(id, 0);

  const path: string[] = [];
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  function normalizeCycle(raw: string[]): string[] {
    if (raw.length === 0) return raw;
    let minIdx = 0;
    for (let i = 1; i < raw.length; i++) {
      if (compareIds(raw[i]!, raw[minIdx]!) < 0) minIdx = i;
    }
    return [...raw.slice(minIdx), ...raw.slice(0, minIdx)];
  }

  function dfs(u: string): void {
    color.set(u, 1);
    path.push(u);
    for (const v of edges.get(u) ?? []) {
      if (!color.has(v)) continue; // unknown dep handled elsewhere
      const state = color.get(v);
      if (state === 1) {
        const start = path.indexOf(v);
        if (start >= 0) {
          const loop = normalizeCycle(path.slice(start));
          const key = loop.join('>');
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key);
            cycles.push(loop);
          }
        }
      } else if (state === 0) {
        dfs(v);
      }
    }
    path.pop();
    color.set(u, 2);
  }

  const sorted = [...ids].sort(compareIds);
  for (const id of sorted) {
    if (color.get(id) === 0) dfs(id);
  }
  return cycles;
}

/** MVP blocking validation. Unknown owners are not errors. */
export function validate(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tasks = project.tasks;
  const seen = new Map<string, number>();

  for (const task of tasks) {
    const prev = seen.get(task.id);
    if (prev !== undefined) {
      issues.push({
        code: 'DUPLICATE_ID',
        level: 'error',
        taskIds: [task.id],
        message: `Duplicate task id ${task.id}`,
      });
    } else {
      seen.set(task.id, 1);
    }
  }

  const idSet = new Set(seen.keys());

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (dep === task.id) {
        issues.push({
          code: 'SELF_DEPENDENCY',
          level: 'error',
          taskIds: [task.id],
          message: `Task ${task.id} depends on itself`,
        });
      } else if (!idSet.has(dep)) {
        issues.push({
          code: 'UNKNOWN_DEPENDENCY',
          level: 'error',
          taskIds: [task.id],
          message: `Task ${task.id} depends on unknown task ${dep}`,
        });
      }
    }
  }

  for (const loop of findCycles(tasks)) {
    issues.push({
      code: 'CYCLE',
      level: 'error',
      taskIds: loop,
      message: `Dependency cycle: ${loop.join(' → ')} → ${loop[0]}`,
    });
  }

  return issues;
}
