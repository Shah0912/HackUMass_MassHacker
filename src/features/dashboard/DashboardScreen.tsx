import { useMemo } from 'react';
import { analyse } from '@/core/analyse';
import type { Analysis, Project, Verdict } from '@/core/types';
import { DependencyGraph } from '@/features/dashboard/DependencyGraph';
import { useProjectStore } from '@/store/projectStore';

function formatHours(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded}h`;
}

function verdictCopy(verdict: Verdict, bufferHours: number): { label: string; hint: string } {
  if (verdict === 'late') {
    return {
      label: 'Late',
      hint: `${formatHours(-bufferHours)} past the deadline on the critical path`,
    };
  }
  if (verdict === 'at_risk') {
    return {
      label: 'At risk',
      hint: `Only ${formatHours(bufferHours)} buffer left`,
    };
  }
  return {
    label: 'On track',
    hint: `${formatHours(bufferHours)} buffer before the deadline`,
  };
}

function VerdictChip({ analysis }: { analysis: Analysis }) {
  const { label, hint } = verdictCopy(analysis.verdict, analysis.bufferHours);
  const styles =
    analysis.verdict === 'late'
      ? 'bg-red-700 text-white'
      : analysis.verdict === 'at_risk'
        ? 'bg-amber-600 text-white'
        : 'bg-teal-800 text-white';
  const icon =
    analysis.verdict === 'late' ? '!' : analysis.verdict === 'at_risk' ? '~' : '✓';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${styles}`}
        title={hint}
      >
        <span aria-hidden className="font-mono text-base leading-none">
          {icon}
        </span>
        {label}
      </span>
      <p className="text-sm text-stone-700">{hint}</p>
    </div>
  );
}

function InvalidState({ analysis, onReset }: { analysis: Analysis; onReset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900">Graph has errors</h1>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-800">
        {analysis.issues.map((issue, i) => (
          <li key={`${issue.code}-${i}`}>{issue.message}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-md border border-stone-300 px-4 py-2 text-sm"
      >
        Start over
      </button>
    </main>
  );
}

export function DashboardScreen({ project }: { project: Project }) {
  const reset = useProjectStore((s) => s.reset);
  const analysis = useMemo(() => analyse(project, new Date()), [project]);

  if (!analysis.valid) {
    return <InvalidState analysis={analysis} onReset={reset} />;
  }

  const finishLabel = formatHours(analysis.durationHours);
  const deadlineLabel = new Date(project.deadline).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#f5f5f4_0%,_#e7e5e4_55%,_#d6d3d1_100%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase">Linchpin</p>
            <h1 className="mt-1 text-3xl font-semibold text-stone-900">{project.name}</h1>
            <p className="mt-1 text-sm text-stone-600">
              Critical path {finishLabel} · Deadline {deadlineLabel} · Available{' '}
              {formatHours(analysis.availableHours)} · Buffer {formatHours(analysis.bufferHours)}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-stone-400 bg-white/80 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-white"
          >
            Start over
          </button>
        </header>

        <section className="rounded-md border border-stone-300 bg-white/90 px-4 py-3 shadow-sm">
          <VerdictChip analysis={analysis} />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-stone-800 uppercase">
              Dependency graph
            </h2>
            <p className="text-xs text-stone-600">
              Thick edges + “critical” = critical path · Amber badge = bottleneck (not colour alone)
            </p>
          </div>
          <DependencyGraph project={project} analysis={analysis} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-stone-800 uppercase">
              Top risks
            </h2>
            {analysis.risks.length === 0 ? (
              <p className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
                No major risks — looking healthy.
              </p>
            ) : (
              <ul className="space-y-2">
                {analysis.risks.map((risk) => (
                  <li
                    key={risk.id}
                    className="rounded-md border border-stone-300 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                        {risk.severity}
                      </span>
                      <p className="text-sm font-semibold text-stone-900">{risk.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">{risk.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-stone-800 uppercase">
              People load
            </h2>
            <ul className="space-y-3">
              {project.members.map((member) => {
                const m = analysis.members[member.id];
                if (!m) return null;
                const pct = Math.min(100, m.loadRatio * 100);
                const overloaded = m.loadRatio > 1;
                return (
                  <li key={member.id} className="rounded-md border border-stone-300 bg-white px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-900">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: member.color }}
                          aria-hidden
                        />
                        {member.name}
                        {overloaded ? (
                          <span className="ml-2 text-xs font-medium text-red-700">overloaded</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-stone-600">
                        {formatHours(m.remainingHours)} / {formatHours(m.capacityHours)} ·{' '}
                        {m.openTaskCount} open
                      </p>
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded bg-stone-200"
                      role="meter"
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${member.name} load ${Math.round(m.loadRatio * 100)}%`}
                    >
                      <div
                        className={`h-full ${overloaded ? 'bg-red-600' : 'bg-teal-700'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      Critical hours: {formatHours(m.criticalHours)} · Load ratio{' '}
                      {Math.round(m.loadRatio * 100) / 100}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
