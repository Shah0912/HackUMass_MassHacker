// STAND-IN ENGINE for UI development. Follows the spec's algorithm so numbers are realistic.
// P1 replaces this with src/core/analyse.ts; the UI imports it only through src/engine.ts.
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
import { LIMITS } from '@/core/types';

const EPS = 0.01;
const HOUR_MS = 3_600_000;

export const byId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmtH = (n: number) => `${r1(Math.abs(n))} h`;

export function remainingHours(t: Task): number {
  if (t.cut || t.status === 'done') return 0;
  if (t.status === 'in_progress') return t.estimateHours / 2;
  return t.estimateHours;
}

/** Dependencies of a task, skipping cut tasks (a dependency on a cut task becomes its dependencies). */
function effectiveDeps(task: Task, all: Map<string, Task>): string[] {
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = [...task.dependsOn];
  while (stack.length) {
    const d = stack.pop()!;
    if (seen.has(d) || d === task.id) continue;
    seen.add(d);
    const dt = all.get(d);
    if (!dt) continue;
    if (dt.cut) stack.push(...dt.dependsOn);
    else out.add(d);
  }
  return [...out].sort(byId);
}

// ---------------- Validation ----------------

export function validate(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = project.tasks;
  const active = all.filter((t) => !t.cut);
  const ids = new Map<string, number>();
  for (const t of all) ids.set(t.id, (ids.get(t.id) ?? 0) + 1);
  const memberIds = new Set(project.members.map((m) => m.id));
  const map = new Map(all.map((t) => [t.id, t]));
  const name = (id: string) => `"${map.get(id)?.title || id}"`;

  if (active.length > LIMITS.maxTasks) {
    issues.push({ code: 'TOO_MANY_TASKS', level: 'error', taskIds: [], message: `More than ${LIMITS.maxTasks} tasks.` });
  }
  for (const [id, n] of ids) {
    if (n > 1) issues.push({ code: 'DUPLICATE_ID', level: 'error', taskIds: [id], message: `${n} tasks share the ID ${id}.` });
  }
  for (const t of active) {
    if (!t.title.trim()) issues.push({ code: 'EMPTY_TITLE', level: 'error', taskIds: [t.id], message: `Task ${t.id} has no title.` });
    if (!(t.estimateHours >= 0.25 && t.estimateHours <= 80)) {
      issues.push({ code: 'BAD_ESTIMATE', level: 'error', taskIds: [t.id], message: `${name(t.id)} needs an estimate between 0.25 and 80 h.` });
    }
    if (t.ownerId && !memberIds.has(t.ownerId)) {
      issues.push({ code: 'UNKNOWN_OWNER', level: 'error', taskIds: [t.id], message: `${name(t.id)} is owned by someone not on the team.` });
    }
    for (const d of t.dependsOn) {
      if (d === t.id) issues.push({ code: 'SELF_DEPENDENCY', level: 'error', taskIds: [t.id], message: `${name(t.id)} depends on itself.` });
      else if (!map.has(d)) issues.push({ code: 'UNKNOWN_DEPENDENCY', level: 'error', taskIds: [t.id], message: `${name(t.id)} depends on a task that doesn't exist (${d}).` });
    }
  }

  for (const cycle of findCycles(active, map)) {
    issues.push({
      code: 'CYCLE',
      level: 'error',
      taskIds: cycle,
      message: `These tasks wait on each other in a loop: ${cycle.map(name).join(' → ')} → ${name(cycle[0]!)}.`,
    });
  }

  for (const t of active) {
    if (t.status !== 'done' && !t.ownerId) {
      issues.push({ code: 'NO_OWNER', level: 'warning', taskIds: [t.id], message: `${name(t.id)} has no owner.` });
    }
  }
  if (active.length > 3) {
    const hasDependents = new Set(active.flatMap((t) => effectiveDeps(t, map)));
    for (const t of active) {
      if (effectiveDeps(t, map).length === 0 && !hasDependents.has(t.id)) {
        issues.push({ code: 'ORPHAN_TASK', level: 'warning', taskIds: [t.id], message: `${name(t.id)} isn't connected to any other task.` });
      }
    }
  }
  return issues;
}

/** Tarjan SCC; one cycle per strongly connected component, listed in loop order. */
function findCycles(active: Task[], all: Map<string, Task>): string[][] {
  const deps = new Map(active.map((t) => [t.id, effectiveDeps(t, all).filter((d) => !all.get(d)?.cut)]));
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of deps.get(v) ?? []) {
      if (!deps.has(w)) continue;
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  };
  for (const id of [...deps.keys()].sort(byId)) if (!idx.has(id)) strong(id);

  return sccs.map((comp) => {
    const inComp = new Set(comp);
    const start = [...comp].sort(byId)[0]!;
    // Walk dependents-direction path start → ... → start inside the component.
    const path: string[] = [];
    const visit = (v: string, seen: Set<string>): boolean => {
      path.push(v);
      const dependents = comp.filter((c) => (deps.get(c) ?? []).includes(v)).sort(byId);
      for (const n of dependents) {
        if (n === start && path.length > 1) return true;
        if (!seen.has(n) && inComp.has(n)) {
          seen.add(n);
          if (visit(n, seen)) return true;
        }
      }
      path.pop();
      return false;
    };
    return visit(start, new Set([start])) ? path : [...comp].sort(byId);
  });
}

// ---------------- Analysis ----------------

const EMPTY: Omit<Analysis, 'valid' | 'issues'> = {
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

export function analyse(project: Project, now: Date, opts: { withRisks?: boolean } = {}): Analysis {
  const issues = validate(project);
  if (issues.some((i) => i.level === 'error')) return { ...EMPTY, valid: false, issues };

  const all = new Map(project.tasks.map((t) => [t.id, t]));
  const active = project.tasks.filter((t) => !t.cut);
  const deps = new Map(active.map((t) => [t.id, effectiveDeps(t, all)]));
  const dependents = new Map<string, string[]>(active.map((t) => [t.id, []]));
  for (const [id, ds] of deps) for (const d of ds) dependents.get(d)?.push(id);
  const rem = new Map(active.map((t) => [t.id, remainingHours(t)]));

  // Kahn's algorithm, ties by ID.
  const indeg = new Map(active.map((t) => [t.id, deps.get(t.id)!.length]));
  const ready = active.filter((t) => indeg.get(t.id) === 0).map((t) => t.id).sort(byId);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const n of dependents.get(id)!) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) {
        ready.push(n);
        ready.sort(byId);
      }
    }
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(0, ...deps.get(id)!.map((d) => ef.get(d)!));
    es.set(id, start);
    ef.set(id, start + rem.get(id)!);
  }
  const duration = Math.max(0, ...order.map((id) => ef.get(id)!));
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const finish = Math.min(duration, ...dependents.get(id)!.map((d) => ls.get(d)!));
    lf.set(id, finish);
    ls.set(id, finish - rem.get(id)!);
  }

  // Critical path walk-back.
  const criticalPath: string[] = [];
  const endCandidates = order.filter((id) => Math.abs(ef.get(id)! - duration) < EPS && rem.get(id)! > 0).sort(byId);
  let cur = duration > 0 ? endCandidates[0] : undefined;
  while (cur) {
    criticalPath.unshift(cur);
    const start = es.get(cur)!;
    if (start < EPS) break;
    cur = deps
      .get(cur)!
      .filter((d) => Math.abs(ef.get(d)! - start) < EPS)
      .sort(byId)[0];
  }

  const downstream = new Map<string, number>();
  for (const t of active) {
    const seen = new Set<string>();
    const queue = [...dependents.get(t.id)!];
    while (queue.length) {
      const n = queue.shift()!;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(...dependents.get(n)!);
    }
    downstream.set(t.id, [...seen].filter((id) => all.get(id)!.status !== 'done').length);
  }

  const tasks: Record<string, TaskMetrics> = {};
  for (const t of active) {
    const slack = ls.get(t.id)! - es.get(t.id)!;
    tasks[t.id] = {
      taskId: t.id,
      remainingHours: rem.get(t.id)!,
      earliestStart: es.get(t.id)!,
      earliestFinish: ef.get(t.id)!,
      latestStart: ls.get(t.id)!,
      latestFinish: lf.get(t.id)!,
      slackHours: slack,
      isCritical: slack < EPS && rem.get(t.id)! > 0,
      downstreamCount: downstream.get(t.id)!,
    };
  }

  const daysLeft = Math.max(0, (Date.parse(project.deadline) - now.getTime()) / (24 * HOUR_MS));
  const availableHours = daysLeft * project.workHoursPerDay;
  const bufferHours = availableHours - duration;
  const verdict: Verdict = bufferHours < 0 ? 'late' : bufferHours < 0.15 * duration ? 'at_risk' : 'on_track';

  const members: Record<string, MemberMetrics> = {};
  for (const m of project.members) {
    const mine = active.filter((t) => t.ownerId === m.id);
    const remaining = mine.reduce((s, t) => s + rem.get(t.id)!, 0);
    const capacity = daysLeft * m.hoursPerDay;
    members[m.id] = {
      memberId: m.id,
      openTaskCount: mine.filter((t) => t.status !== 'done').length,
      remainingHours: remaining,
      criticalHours: mine.filter((t) => tasks[t.id]!.isCritical).reduce((s, t) => s + rem.get(t.id)!, 0),
      capacityHours: capacity,
      loadRatio: capacity > 0 ? remaining / capacity : remaining > 0 ? 99 : 0,
    };
  }

  const unfinished = active.filter((t) => t.status !== 'done');
  const bottleneck = unfinished
    .filter((t) => downstream.get(t.id)! > 0)
    .sort(
      (a, b) =>
        downstream.get(b.id)! - downstream.get(a.id)! ||
        Number(tasks[b.id]!.isCritical) - Number(tasks[a.id]!.isCritical) ||
        byId(a.id, b.id),
    )[0];

  const analysis: Analysis = {
    valid: true,
    issues,
    order,
    criticalPath,
    durationHours: duration,
    availableHours,
    bufferHours,
    verdict,
    tasks,
    members,
    bottleneckTaskId: bottleneck?.id ?? null,
    risks: [],
  };
  if (opts.withRisks !== false) analysis.risks = computeRisks(project, analysis, now);
  return analysis;
}

// ---------------- Risks ----------------

const SEVERITY = { high: 0, medium: 1, low: 2 } as const;

function computeRisks(project: Project, a: Analysis, now: Date): Risk[] {
  const risks: Risk[] = [];
  const task = new Map(project.tasks.map((t) => [t.id, t]));
  const member = new Map(project.members.map((m) => [m.id, m]));
  const title = (id: string) => `"${task.get(id)?.title ?? id}"`;
  const who = (id: string | null | undefined) => (id ? member.get(id)?.name ?? 'someone' : 'nobody');
  const active = project.tasks.filter((t) => !t.cut && a.tasks[t.id]);
  const unfinished = active.filter((t) => t.status !== 'done');
  const critical = active.filter((t) => a.tasks[t.id]!.isCritical);

  const leastLoaded = (exclude: string) =>
    project.members
      .filter((m) => m.id !== exclude && m.hoursPerDay > 0)
      .sort((x, y) => a.members[x.id]!.loadRatio - a.members[y.id]!.loadRatio || byId(x.id, y.id))[0];

  const reassignSuggestion = (fromId: string, pool: Task[]): Risk['suggestion'] => {
    const to = leastLoaded(fromId);
    if (!to) return undefined;
    const toMm = a.members[to.id]!;
    const candidates = pool
      .filter((t) => t.ownerId === fromId && t.status === 'todo')
      .sort((x, y) => a.tasks[y.id]!.remainingHours - a.tasks[x.id]!.remainingHours || byId(x.id, y.id));
    // Largest task that keeps the receiver at or under 100%, else the smallest one.
    const pick =
      candidates.find((t) => toMm.remainingHours + a.tasks[t.id]!.remainingHours <= toMm.capacityHours) ??
      candidates[candidates.length - 1];
    if (!pick) return undefined;
    const h = a.tasks[pick.id]!.remainingHours;
    const toLoad = (a.members[to.id]!.remainingHours + h) / Math.max(a.members[to.id]!.capacityHours, EPS);
    return {
      kind: 'reassign',
      taskId: pick.id,
      toMemberId: to.id,
      text: `Give ${title(pick.id)} (${fmtH(h)}) to ${to.name}, who would then be at ${Math.round(toLoad * 100)}% load.`,
    };
  };

  // late
  if (a.bufferHours < 0) {
    const cutCandidate = critical
      .filter((t) => t.status !== 'done')
      .sort((x, y) => a.tasks[x.id]!.downstreamCount - a.tasks[y.id]!.downstreamCount || byId(x.id, y.id))[0];
    let suggestion: Risk['suggestion'];
    if (cutCandidate) {
      const trial = { ...project, tasks: project.tasks.map((t) => (t.id === cutCandidate.id ? { ...t, cut: true } : t)) };
      const after = analyse(trial, now, { withRisks: false });
      const gain = after.valid ? after.bufferHours - a.bufferHours : 0;
      if (gain > EPS) {
        suggestion = {
          kind: 'cut',
          taskId: cutCandidate.id,
          bufferGainHours: gain,
          text: `Cut ${title(cutCandidate.id)} from scope to win back ${fmtH(gain)}.`,
        };
      }
    }
    risks.push({
      id: 'late',
      kind: 'late',
      severity: 'high',
      title: `Late by ${fmtH(a.bufferHours)}`,
      detail: `The longest chain of work needs ${fmtH(a.durationHours)}, but only ${fmtH(a.availableHours)} of team time is left before the deadline.`,
      taskIds: a.criticalPath,
      memberIds: [],
      suggestion,
    });
  }

  // thin_buffer
  if (a.verdict === 'at_risk') {
    const first = a.criticalPath.map((id) => task.get(id)!).find((t) => t.status === 'todo');
    risks.push({
      id: 'thin_buffer',
      kind: 'thin_buffer',
      severity: 'medium',
      title: `Only ${fmtH(a.bufferHours)} of slack`,
      detail: `${fmtH(a.bufferHours)} spare against ${fmtH(a.durationHours)} of critical work. One slow task makes you late.`,
      taskIds: a.criticalPath,
      memberIds: [],
      suggestion: first
        ? { kind: 'start_now', taskId: first.id, text: `${who(first.ownerId)} should start ${title(first.id)} now.` }
        : undefined,
    });
  }

  // critical_concentration
  const totalCritical = Object.values(a.members).reduce((s, m) => s + m.criticalHours, 0);
  if (project.members.length >= 2 && totalCritical > 0) {
    for (const m of project.members) {
      const share = a.members[m.id]!.criticalHours / totalCritical;
      if (share >= 0.5) {
        risks.push({
          id: `critical_concentration:${m.id}`,
          kind: 'critical_concentration',
          severity: 'high',
          title: `${m.name} owns ${Math.round(share * 100)}% of the critical path`,
          detail: `${fmtH(a.members[m.id]!.criticalHours)} of the ${fmtH(totalCritical)} on the critical path sits with one person.`,
          taskIds: critical.filter((t) => t.ownerId === m.id).map((t) => t.id),
          memberIds: [m.id],
          suggestion: reassignSuggestion(m.id, critical),
        });
      }
    }
  }

  // person_overload
  for (const m of project.members) {
    const mm = a.members[m.id]!;
    if (mm.loadRatio > 0.8) {
      risks.push({
        id: `person_overload:${m.id}`,
        kind: 'person_overload',
        severity: mm.loadRatio > 1 ? 'high' : 'medium',
        title: `${m.name} is at ${mm.loadRatio >= 99 ? 'no capacity' : `${Math.round(mm.loadRatio * 100)}% load`}`,
        detail: `${fmtH(mm.remainingHours)} of work left across ${mm.openTaskCount} tasks, but only ${fmtH(mm.capacityHours)} available before the deadline.`,
        taskIds: unfinished.filter((t) => t.ownerId === m.id).map((t) => t.id),
        memberIds: [m.id],
        suggestion: reassignSuggestion(m.id, unfinished),
      });
    }
  }

  // task_bottleneck: only the linchpin, so the panel tells one story.
  const bottlenecks = unfinished.filter((t) => {
    const n = a.tasks[t.id]!.downstreamCount;
    return t.id === a.bottleneckTaskId && n >= 3 && n >= 0.25 * unfinished.length;
  });
  for (const t of bottlenecks) {
    const n = a.tasks[t.id]!.downstreamCount;
    const notStarted = t.status === 'todo' || t.status === 'blocked';
    risks.push({
      id: `task_bottleneck:${t.id}`,
      kind: 'task_bottleneck',
      severity: notStarted ? 'high' : 'medium',
      title: `${n} tasks are waiting on ${title(t.id)}`,
      detail: `${title(t.id)} (${who(t.ownerId)}, ${t.status === 'in_progress' ? 'in progress' : t.status === 'todo' ? 'not started' : t.status}) blocks ${n} of ${unfinished.length} unfinished tasks.`,
      taskIds: [t.id],
      memberIds: t.ownerId ? [t.ownerId] : [],
      suggestion: notStarted
        ? { kind: 'start_now', taskId: t.id, text: `${t.ownerId ? `${who(t.ownerId)} should start` : 'Assign and start'} ${title(t.id)} first.` }
        : undefined,
    });
  }

  // unassigned
  const unowned = unfinished.filter((t) => !t.ownerId);
  for (const t of unowned.filter((t) => a.tasks[t.id]!.isCritical)) {
    const to = leastLoaded('');
    risks.push({
      id: `unassigned:${t.id}`,
      kind: 'unassigned',
      severity: 'high',
      title: `Nobody owns ${title(t.id)}`,
      detail: `${title(t.id)} is on the critical path (${fmtH(a.tasks[t.id]!.remainingHours)}) and has no owner.`,
      taskIds: [t.id],
      memberIds: [],
      suggestion: to ? { kind: 'assign', taskId: t.id, toMemberId: to.id, text: `Assign it to ${to.name}, the least-loaded member.` } : undefined,
    });
  }
  const otherUnowned = unowned.filter((t) => !a.tasks[t.id]!.isCritical);
  if (otherUnowned.length) {
    const to = leastLoaded('');
    risks.push({
      id: 'unassigned:other',
      kind: 'unassigned',
      severity: 'low',
      title: `${otherUnowned.length} task${otherUnowned.length > 1 ? 's have' : ' has'} no owner`,
      detail: `${otherUnowned.map((t) => title(t.id)).join(', ')} ${otherUnowned.length > 1 ? 'are' : 'is'} unassigned (${fmtH(otherUnowned.reduce((s, t) => s + a.tasks[t.id]!.remainingHours, 0))} in total).`,
      taskIds: otherUnowned.map((t) => t.id),
      memberIds: [],
      suggestion: to ? { kind: 'assign', taskId: otherUnowned[0]!.id, toMemberId: to.id, text: `Assign to ${to.name}, the least-loaded member.` } : undefined,
    });
  }

  // blocked
  for (const t of unfinished.filter((t) => t.status === 'blocked')) {
    risks.push({
      id: `blocked:${t.id}`,
      kind: 'blocked',
      severity: 'medium',
      title: `${title(t.id)} is blocked`,
      detail: `${who(t.ownerId)} marked it blocked; ${a.tasks[t.id]!.downstreamCount} tasks are downstream of it.`,
      taskIds: [t.id],
      memberIds: t.ownerId ? [t.ownerId] : [],
      suggestion: { kind: 'confirm', taskId: t.id, text: `Confirm with ${who(t.ownerId)} what it is waiting on.` },
    });
  }

  // shaky_estimates
  const shaky = critical.filter((t) => t.estimateInferred);
  if (shaky.length >= 2) {
    risks.push({
      id: 'shaky_estimates',
      kind: 'shaky_estimates',
      severity: 'low',
      title: `${shaky.length} critical estimates are guesses`,
      detail: `The chat gave no time for ${shaky.map((t) => title(t.id)).join(', ')}; the AI filled in typical values.`,
      taskIds: shaky.map((t) => t.id),
      memberIds: [],
      suggestion: { kind: 'confirm', taskId: shaky[0]!.id, text: 'Confirm these estimates with their owners.' },
    });
  }

  return risks
    .map((r, i) => ({ r, i }))
    .sort((x, y) => SEVERITY[x.r.severity] - SEVERITY[y.r.severity] || x.i - y.i)
    .slice(0, 5)
    .map((x) => x.r);
}
