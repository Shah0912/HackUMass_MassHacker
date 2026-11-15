// Browser-side client for the AI endpoints. Calls /api/extract and /api/rescue (Gemini or Claude,
// chosen on the server). With VITE_MOCK_AI=1 everything is mocked locally: no network, no key.
// "Try the sample" never calls the AI; it loads a prepared project from the store.
//
// Mock tricks for testing error states: put "#fail" in the pasted text for a retryable
// UPSTREAM_ERROR, "#refuse" for a non-retryable MODEL_REFUSED.
import type { Analysis, Project, Task } from '@/core/types';
import { memberColor } from '@/core/types';
import { analyse, byId, fmtH } from '@/engine';
import { buildSampleProject } from '@/mocks/sampleProject';
import { ProjectSchema } from '@/core/schema';
import type { RescueProposal, RescueRequest } from '@/ai/contracts';

export const MOCK_AI = import.meta.env.VITE_MOCK_AI === '1';

export interface ExtractInput {
  name: string;
  text: string;
  deadline: string; // ISO 8601
  workHoursPerDay: number;
  members: { name: string; hoursPerDay: number }[];
  detectMembers: boolean;
  /** false = the user never touched the deadline picker; a due date in the text then wins. */
  deadlineFromUser?: boolean;
  /** IANA time zone, for reading "due Sunday 5pm" in local time. */
  timeZone?: string;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; retryable: boolean } };

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiClientError('UPSTREAM_ERROR', "Couldn't reach the server. Check your connection.", true);
  }
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiClientError('UPSTREAM_ERROR', `The server returned an unexpected response (${res.status}).`, true);
  }
  if (!json.ok) throw new ApiClientError(json.error.code, json.error.message, json.error.retryable);
  return json.data;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

// ---------------- Extract ----------------

export async function extractProject(input: ExtractInput, signal?: AbortSignal): Promise<Project> {
  if (!MOCK_AI) {
    const data = await post<unknown>('/api/extract', input, signal);
    const parsed = ProjectSchema.safeParse(data);
    if (!parsed.success) {
      throw new ApiClientError('MODEL_INVALID_OUTPUT', 'The server returned a project we could not read. Try again.', true);
    }
    return parsed.data as Project;
  }

  await wait(2400, signal);
  if (input.text.includes('#refuse')) {
    throw new ApiClientError('MODEL_REFUSED', "The AI couldn't process this text. Try editing it or use the sample.", false);
  }
  if (input.text.includes('#fail')) {
    throw new ApiClientError('UPSTREAM_ERROR', 'The AI service had a problem. Your text is safe; try again.', true);
  }

  // Mock "extraction": the sample's tasks, with the user's name, deadline and hours.
  const sample = buildSampleProject();
  const members = [...sample.members];
  // Keep any extra members typed on the intake form so they show up as assignable.
  for (const m of input.members) {
    if (m.name.trim() && !members.some((x) => x.name.toLowerCase() === m.name.trim().toLowerCase())) {
      members.push({ id: `m${members.length + 1}`, name: m.name.trim(), hoursPerDay: m.hoursPerDay, color: memberColor(members.length) });
    } else {
      const match = members.find((x) => x.name.toLowerCase() === m.name.trim().toLowerCase());
      if (match) match.hoursPerDay = m.hoursPerDay;
    }
  }
  return {
    ...sample,
    name: input.name.trim() || 'Untitled project',
    deadline: input.deadline,
    workHoursPerDay: input.workHoursPerDay,
    members,
    rawInput: input.text,
  };
}

// ---------------- Rescue ----------------

export interface RescueAction {
  id: string;
  kind: 'cut' | 'reassign' | 'split' | 'start_now' | 'reduce_scope';
  taskId: string;
  toMemberId?: string;
  newEstimateHours?: number;
  rationale: string;
  // Computed by code after applying the action to a copy (never from the model):
  bufferGainHours: number;
  worstLoadBefore: number;
  worstLoadAfter: number;
}

export function applyRescueAction(project: Project, a: Pick<RescueAction, 'kind' | 'taskId' | 'toMemberId' | 'newEstimateHours'>): Project {
  const edit = (fn: (t: Task) => Task): Project => ({
    ...project,
    tasks: project.tasks.map((t) => (t.id === a.taskId ? { ...fn(t), source: 'user' } : t)),
  });
  switch (a.kind) {
    case 'cut':
      return edit((t) => ({ ...t, cut: true }));
    case 'reassign':
      return edit((t) => ({ ...t, ownerId: a.toMemberId ?? t.ownerId }));
    case 'split':
    case 'reduce_scope':
      return edit((t) => ({ ...t, estimateHours: a.newEstimateHours ?? t.estimateHours }));
    case 'start_now':
      // Starting earlier doesn't change remaining hours in this model, so verification drops it.
      return project;
  }
}

/** Compact, raw-text-free view for the model: IDs, hours and computed metrics only. */
function toRescueRequest(project: Project, a: Analysis): RescueRequest {
  return {
    tasks: project.tasks
      .filter((t) => !t.cut)
      .map((t) => {
        const m = a.tasks[t.id];
        return {
          id: t.id,
          title: t.title,
          ownerId: t.ownerId,
          remainingHours: m?.remainingHours ?? 0,
          status: t.status,
          dependsOn: t.dependsOn,
          slackHours: m?.slackHours ?? 0,
          isCritical: m?.isCritical ?? false,
          downstreamCount: m?.downstreamCount ?? 0,
        };
      }),
    members: project.members.map((m) => ({ id: m.id, name: m.name, loadRatio: a.members[m.id]?.loadRatio ?? 0 })),
    durationHours: a.durationHours,
    availableHours: a.availableHours,
    bufferHours: a.bufferHours,
    risks: a.risks.slice(0, 5).map((r) => ({ kind: r.kind, title: r.title, detail: r.detail })),
  };
}

const worstLoad = (an: Analysis) => Math.max(0, ...Object.values(an.members).map((m) => m.loadRatio));

/** Mock "model" proposals, then the real code check: apply each to a copy, keep only what helps. */
export async function generateRescuePlan(project: Project, now: Date, signal?: AbortSignal): Promise<RescueAction[]> {
  const before = analyse(project, now);
  let proposals: Omit<RescueAction, 'id' | 'bufferGainHours' | 'worstLoadBefore' | 'worstLoadAfter'>[];

  if (!MOCK_AI) {
    proposals = before.valid ? await post<RescueProposal[]>('/api/rescue', toRescueRequest(project, before), signal) : [];
  } else {
    await wait(1800, signal);
    proposals = mockProposals(project, before);
  }

  const kept: RescueAction[] = [];
  const taskIds = new Set(project.tasks.map((t) => t.id));
  const memberIds = new Set(project.members.map((m) => m.id));
  for (const [i, p] of proposals.entries()) {
    if (!taskIds.has(p.taskId) || (p.toMemberId && !memberIds.has(p.toMemberId))) continue;
    const after = analyse(applyRescueAction(project, p), now, { withRisks: false });
    if (!after.valid) continue;
    const gain = after.bufferHours - before.bufferHours;
    const wb = worstLoad(before);
    const wa = worstLoad(after);
    if (gain > 0.01 || wa < wb - 0.01) {
      kept.push({ ...p, id: `a${i + 1}`, bufferGainHours: gain, worstLoadBefore: wb, worstLoadAfter: wa });
    }
  }
  return kept.slice(0, 5);
}

function mockProposals(project: Project, a: Analysis) {
  if (!a.valid) return [];
  const task = new Map(project.tasks.map((t) => [t.id, t]));
  const name = (id?: string | null) => project.members.find((m) => m.id === id)?.name ?? 'someone';
  const out: Omit<RescueAction, 'id' | 'bufferGainHours' | 'worstLoadBefore' | 'worstLoadAfter'>[] = [];
  const crit = a.criticalPath.map((id) => task.get(id)!).filter((t) => t.status !== 'done');

  // Cut the critical task with the fewest dependents.
  const cut = [...crit].sort((x, y) => a.tasks[x.id]!.downstreamCount - a.tasks[y.id]!.downstreamCount || byId(x.id, y.id))[0];
  if (cut) out.push({ kind: 'cut', taskId: cut.id, rationale: `"${cut.title}" is on the critical path but nothing important waits on it. Drop it for the demo.` });

  // Reduce scope of the biggest critical task.
  const big = [...crit].sort((x, y) => y.estimateHours - x.estimateHours)[0];
  if (big && big.estimateHours >= 2) {
    out.push({
      kind: 'reduce_scope',
      taskId: big.id,
      newEstimateHours: Math.max(0.5, Math.round(big.estimateHours * 0.6 * 4) / 4),
      rationale: `"${big.title}" is the largest critical task (${fmtH(big.estimateHours)}). Build only what the demo shows.`,
    });
  }

  // Reassign from the most overloaded person to the least loaded.
  const ms = Object.values(a.members).sort((x, y) => y.loadRatio - x.loadRatio);
  const from = ms[0];
  const to = ms[ms.length - 1];
  if (from && to && from.memberId !== to.memberId && from.loadRatio > 1) {
    const t = project.tasks
      .filter((t) => t.ownerId === from.memberId && t.status === 'todo' && !t.cut)
      .sort((x, y) => x.estimateHours - y.estimateHours)[0];
    if (t) out.push({ kind: 'reassign', taskId: t.id, toMemberId: to.memberId, rationale: `${name(from.memberId)} has more work than time. ${name(to.memberId)} has room for "${t.title}".` });
  }
  return out;
}
