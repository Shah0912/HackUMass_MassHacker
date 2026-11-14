import type {
  Analysis,
  MemberMetrics,
  Project,
  Risk,
  Task,
  TaskMetrics,
  ValidationIssue,
  Verdict,
} from '@/core/types';
import { validate } from '@/core/validate';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CRITICAL_EPS = 0.01;

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emptyAnalysis(issues: ValidationIssue[]): Analysis {
  return {
    valid: false,
    issues,
    order: [],
    criticalPath: [],
    durationHours: 0,
    availableHours: 0,
    bufferHours: 0,
    verdict: 'on_track',
    tasks: {},
    members: {},
    bottleneckTaskId: null,
    risks: [],
  };
}

export function remainingHours(task: Task): number {
  if (task.status === 'done' || task.cut) return 0;
  if (task.status === 'in_progress') return task.estimateHours / 2;
  return task.estimateHours;
}

function isUnfinished(task: Task): boolean {
  return remainingHours(task) > 0;
}

/** Days from now to deadline (calendar days). Never negative. */
export function daysToDeadline(deadlineIso: string, now: Date): number {
  const deadline = new Date(deadlineIso);
  const days = (deadline.getTime() - now.getTime()) / MS_PER_DAY;
  return Math.max(0, days);
}

/**
 * Kahn topological order. Edges: dependency → dependent (prereq finishes first).
 * Zero-indegree ties broken by lowest task ID.
 */
export function topologicalOrder(tasks: Task[]): string[] {
  const ids = tasks.map((t) => t.id);
  const idSet = new Set(ids);
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!idSet.has(dep) || dep === task.id) continue;
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      dependents.get(dep)!.push(task.id);
    }
  }

  for (const list of dependents.values()) list.sort(compareIds);

  const ready = ids.filter((id) => indegree.get(id) === 0).sort(compareIds);
  const order: string[] = [];

  while (ready.length > 0) {
    const u = ready.shift()!;
    order.push(u);
    for (const v of dependents.get(u) ?? []) {
      const next = (indegree.get(v) ?? 0) - 1;
      indegree.set(v, next);
      if (next === 0) {
        ready.push(v);
        ready.sort(compareIds);
      }
    }
  }

  return order;
}

function buildDependentsMap(tasks: Task[]): Map<string, string[]> {
  const idSet = new Set(tasks.map((t) => t.id));
  const dependents = new Map<string, string[]>();
  for (const t of tasks) dependents.set(t.id, []);
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!idSet.has(dep) || dep === task.id) continue;
      dependents.get(dep)!.push(task.id);
    }
  }
  return dependents;
}

/** Distinct unfinished tasks reachable through dependents (transitive). */
export function computeDownstreamCounts(
  tasks: Task[],
  remaining: Map<string, number>,
): Map<string, number> {
  const dependents = buildDependentsMap(tasks);
  const counts = new Map<string, number>();

  for (const task of tasks) {
    const seen = new Set<string>();
    const stack = [...(dependents.get(task.id) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of dependents.get(id) ?? []) stack.push(next);
    }
    let unfinished = 0;
    for (const id of seen) {
      if ((remaining.get(id) ?? 0) > 0) unfinished += 1;
    }
    counts.set(task.id, unfinished);
  }

  return counts;
}

function walkCriticalPath(
  byId: Map<string, Task>,
  metrics: Record<string, TaskMetrics>,
  durationHours: number,
): string[] {
  const finishers = Object.values(metrics)
    .filter((m) => Math.abs(m.earliestFinish - durationHours) < CRITICAL_EPS && m.remainingHours > 0)
    .sort((a, b) => compareIds(a.taskId, b.taskId));

  if (finishers.length === 0) {
    // All done / zero remaining: no critical path
    const zeroFinish = Object.values(metrics)
      .filter((m) => Math.abs(m.earliestFinish - durationHours) < CRITICAL_EPS)
      .sort((a, b) => compareIds(a.taskId, b.taskId));
    if (zeroFinish.length === 0) return [];
    // duration 0 empty project
    if (durationHours === 0) return [];
  }

  let current = finishers[0]?.taskId;
  if (!current) return [];

  const path: string[] = [];
  const guard = new Set<string>();

  while (current && !guard.has(current)) {
    guard.add(current);
    path.push(current);
    const m = metrics[current]!;
    const currentTask: Task | undefined = byId.get(current);
    if (!currentTask) break;
    const candidates: TaskMetrics[] = [];
    for (const depId of currentTask.dependsOn) {
      const dep = metrics[depId];
      if (dep && Math.abs(dep.earliestFinish - m.earliestStart) < CRITICAL_EPS) {
        candidates.push(dep);
      }
    }
    candidates.sort((a, b) => compareIds(a.taskId, b.taskId));
    current = candidates[0]?.taskId;
  }

  return path.reverse();
}

function pickBottleneck(
  tasks: Task[],
  metrics: Record<string, TaskMetrics>,
  criticalSet: Set<string>,
): string | null {
  let best: string | null = null;
  let bestCount = 0;

  for (const task of tasks) {
    if (!isUnfinished(task)) continue;
    const count = metrics[task.id]?.downstreamCount ?? 0;
    if (count <= 0) continue;

    if (best === null) {
      best = task.id;
      bestCount = count;
      continue;
    }

    if (count > bestCount) {
      best = task.id;
      bestCount = count;
      continue;
    }
    if (count < bestCount) continue;

    const bestOnCrit = criticalSet.has(best);
    const curOnCrit = criticalSet.has(task.id);
    if (curOnCrit && !bestOnCrit) {
      best = task.id;
      continue;
    }
    if (curOnCrit === bestOnCrit && compareIds(task.id, best) < 0) {
      best = task.id;
    }
  }

  return best;
}

function buildRisks(
  project: Project,
  analysis: Pick<
    Analysis,
    | 'bufferHours'
    | 'durationHours'
    | 'availableHours'
    | 'bottleneckTaskId'
    | 'tasks'
    | 'members'
    | 'criticalPath'
  >,
): Risk[] {
  const risks: Risk[] = [];
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const membersById = new Map(project.members.map((m) => [m.id, m]));

  if (analysis.bufferHours < 0) {
    const lateBy = -analysis.bufferHours;
    risks.push({
      id: 'late',
      kind: 'late',
      severity: 'high',
      title: 'Late for the deadline',
      detail: `Critical path is ${formatHours(analysis.durationHours)} but only ${formatHours(analysis.availableHours)} are available (${formatHours(lateBy)} late).`,
      taskIds: [...analysis.criticalPath],
      memberIds: [],
    });
  }

  const overloaded = Object.values(analysis.members)
    .filter((m) => m.loadRatio > 1)
    .sort((a, b) => b.loadRatio - a.loadRatio || compareIds(a.memberId, b.memberId));

  for (const m of overloaded) {
    const member = membersById.get(m.memberId);
    const name = member?.name ?? m.memberId;
    const owned = project.tasks
      .filter((t) => t.ownerId === m.memberId && isUnfinished(t))
      .map((t) => t.id);
    risks.push({
      id: `person_overload-${m.memberId}`,
      kind: 'person_overload',
      severity: 'high',
      title: `${name} is overloaded`,
      detail: `${name} has ${formatHours(m.remainingHours)} remaining against ${formatHours(m.capacityHours)} capacity.`,
      taskIds: owned,
      memberIds: [m.memberId],
    });
  }

  const bottleneckId = analysis.bottleneckTaskId;
  if (bottleneckId) {
    const tm = analysis.tasks[bottleneckId];
    const task = byId.get(bottleneckId);
    if (tm && task && tm.downstreamCount >= 3) {
      const owner = task.ownerId ? membersById.get(task.ownerId) : null;
      const ownerLabel = owner?.name ?? 'unassigned';
      risks.push({
        id: `task_bottleneck-${bottleneckId}`,
        kind: 'task_bottleneck',
        severity: task.status === 'todo' || task.status === 'blocked' ? 'high' : 'medium',
        title: `${task.title} blocks the project`,
        detail: `${task.title} blocks ${tm.downstreamCount} unfinished tasks; owned by ${ownerLabel}; status ${task.status}.`,
        taskIds: [bottleneckId],
        memberIds: task.ownerId ? [task.ownerId] : [],
      });
    }
  }

  // Severity order: high before medium before low; stable within severity by insertion (late → overload → bottleneck)
  const rank = { high: 0, medium: 1, low: 2 } as const;
  risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return risks.slice(0, 3);
}

function formatHours(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}h`;
}

function verdictFor(bufferHours: number, durationHours: number): Verdict {
  if (bufferHours < 0) return 'late';
  if (durationHours > 0 && bufferHours < 0.15 * durationHours) return 'at_risk';
  return 'on_track';
}

/**
 * Pure analysis. Never reads the clock — pass `now` in.
 * When validation fails, only `issues` is meaningful.
 */
export function analyse(project: Project, now: Date): Analysis {
  const issues = validate(project);
  const blocking = issues.some((i) => i.level === 'error');
  if (blocking) return emptyAnalysis(issues);

  const tasks = project.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const remaining = new Map(tasks.map((t) => [t.id, remainingHours(t)]));
  const order = topologicalOrder(tasks);
  const downstream = computeDownstreamCounts(tasks, remaining);

  const metrics: Record<string, TaskMetrics> = {};

  // Forward pass
  for (const id of order) {
    const task = byId.get(id)!;
    const rem = remaining.get(id) ?? 0;
    let earliestStart = 0;
    for (const dep of task.dependsOn) {
      const depM = metrics[dep];
      if (depM) earliestStart = Math.max(earliestStart, depM.earliestFinish);
    }
    metrics[id] = {
      taskId: id,
      remainingHours: rem,
      earliestStart,
      earliestFinish: earliestStart + rem,
      latestStart: 0,
      latestFinish: 0,
      slackHours: 0,
      isCritical: false,
      downstreamCount: downstream.get(id) ?? 0,
    };
  }

  const durationHours =
    order.length === 0
      ? 0
      : Math.max(...order.map((id) => metrics[id]!.earliestFinish), 0);

  // Backward pass
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const rem = remaining.get(id) ?? 0;
    const dependents = tasks.filter((t) => t.dependsOn.includes(id));
    let latestFinish = durationHours;
    if (dependents.length > 0) {
      latestFinish = Math.min(...dependents.map((d) => metrics[d.id]!.latestStart));
    }
    const latestStart = latestFinish - rem;
    const m = metrics[id]!;
    m.latestFinish = latestFinish;
    m.latestStart = latestStart;
    m.slackHours = latestStart - m.earliestStart;
    m.isCritical = rem > 0 && m.slackHours < CRITICAL_EPS;
  }

  const criticalPath = walkCriticalPath(byId, metrics, durationHours);
  const criticalSet = new Set(criticalPath);
  // Ensure critical path tasks are marked (walk may include zero-slack nodes)
  for (const id of criticalPath) {
    if (metrics[id]) metrics[id]!.isCritical = metrics[id]!.remainingHours > 0;
  }

  const days = daysToDeadline(project.deadline, now);
  const availableHours = days * project.workHoursPerDay;
  const bufferHours = availableHours - durationHours;
  const verdict = verdictFor(bufferHours, durationHours);
  const bottleneckTaskId = pickBottleneck(tasks, metrics, criticalSet);

  const members: Record<string, MemberMetrics> = {};
  for (const member of project.members) {
    const owned = tasks.filter((t) => t.ownerId === member.id);
    const open = owned.filter(isUnfinished);
    const remSum = open.reduce((s, t) => s + (remaining.get(t.id) ?? 0), 0);
    const criticalHours = open
      .filter((t) => criticalSet.has(t.id))
      .reduce((s, t) => s + (remaining.get(t.id) ?? 0), 0);
    const capacityHours = days * member.hoursPerDay;
    const loadRatio = capacityHours === 0 ? 99 : remSum / capacityHours;
    members[member.id] = {
      memberId: member.id,
      openTaskCount: open.length,
      remainingHours: remSum,
      criticalHours,
      capacityHours,
      loadRatio,
    };
  }

  const partial = {
    bufferHours,
    durationHours,
    availableHours,
    bottleneckTaskId,
    tasks: metrics,
    members,
    criticalPath,
  };

  return {
    valid: true,
    issues,
    order,
    criticalPath,
    durationHours,
    availableHours,
    bufferHours,
    verdict,
    tasks: metrics,
    members,
    bottleneckTaskId,
    risks: buildRisks(project, partial),
  };
}
