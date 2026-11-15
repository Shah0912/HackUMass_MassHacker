// S8 Rescue plan: AI proposes, code verifies. Every number shown is computed, not the model's.
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/core/types';
import { ApiClientError, generateRescuePlan, type RescueAction } from '@/ai/client';
import { fmtH } from '@/engine';
import { Button } from '@/components/ui';
import { IconAlert, IconScissors, IconSparkle, IconSpinner } from '@/components/icons';

const KIND_LABEL: Record<RescueAction['kind'], string> = {
  cut: 'Cut',
  reassign: 'Reassign',
  split: 'Split',
  start_now: 'Start now',
  reduce_scope: 'Reduce scope',
};

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; actions: RescueAction[] } | { kind: 'error'; message: string; retryable: boolean };

export function RescuePanel({ project, now, onTry, readOnly }: { project: Project; now: Date; onTry: (a: RescueAction) => void; readOnly: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  // A plan is stale once the project changes.
  useEffect(() => setState({ kind: 'idle' }), [project.updatedAt]);

  const run = async () => {
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'done', actions: await generateRescuePlan(project, now, c.signal) });
    } catch (err) {
      if (c.signal.aborted) return;
      const e = err instanceof ApiClientError ? err : null;
      setState({ kind: 'error', message: e?.message ?? 'Something went wrong.', retryable: e?.retryable ?? true });
    }
  };

  const name = (id?: string | null) => project.members.find((m) => m.id === id)?.name ?? 'Unassigned';
  const task = (id: string) => project.tasks.find((t) => t.id === id);

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        The AI suggests up to five moves. Each one is tested against your schedule, and only moves that help are shown, with
        the hours they actually save.
      </div>
      {state.kind !== 'loading' && (
        <Button variant="primary" onClick={run} className="w-full">
          <IconSparkle size={15} /> {state.kind === 'done' ? 'Generate again' : 'Generate plan'}
        </Button>
      )}

      {state.kind === 'loading' && (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <IconSpinner size={14} /> Finding and testing moves…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
          <p className="flex items-center gap-1.5 font-semibold">
            <IconAlert size={14} /> Couldn't make a plan
          </p>
          <p className="mt-1">{state.message}</p>
          {state.retryable && (
            <Button size="sm" className="mt-2" onClick={run}>
              Try again
            </Button>
          )}
        </div>
      )}

      {state.kind === 'done' && state.actions.length === 0 && (
        <div className="py-6 text-center text-sm text-slate-600">
          <p className="font-semibold text-slate-900">No move improves the schedule</p>
          <p className="mt-1">Check the Risks tab for the deterministic fixes.</p>
        </div>
      )}

      {state.kind === 'done' &&
        state.actions.map((a) => {
          const t = task(a.taskId);
          return (
            <article key={a.id} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {a.kind === 'cut' && <IconScissors size={11} />}
                  {KIND_LABEL[a.kind]}
                </span>
                <span className="text-right text-sm font-semibold tabular-nums">
                  {a.bufferGainHours > 0.01 ? (
                    <span className="text-emerald-700">+{fmtH(a.bufferGainHours)} saved</span>
                  ) : (
                    <span className="text-emerald-700">
                      Peak load {Math.round(a.worstLoadBefore * 100)}% → {Math.round(a.worstLoadAfter * 100)}%
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1.5 font-semibold text-slate-900">
                {t?.title ?? a.taskId}
                {a.kind === 'reassign' && <span className="font-normal text-slate-600"> → {name(a.toMemberId)}</span>}
                {a.newEstimateHours !== undefined && <span className="font-normal text-slate-600"> → {fmtH(a.newEstimateHours)}</span>}
              </p>
              <p className="mt-1 text-sm text-slate-600">{a.rationale}</p>
              {!readOnly && (
                <Button size="sm" className="mt-2" onClick={() => onTry(a)}>
                  Try in what-if
                </Button>
              )}
            </article>
          );
        })}
    </div>
  );
}
