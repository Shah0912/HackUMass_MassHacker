// Top bar: the verdict and the numbers behind it. In what-if mode it shows before → after.
import type { Analysis, Project } from '@/core/types';
import { fmtH } from '@/engine';
import { VerdictChip, cn } from '@/components/ui';
import { IconArrowRight } from '@/components/icons';

export function VerdictBar({ project, analysis, before, now }: { project: Project; analysis: Analysis; before?: Analysis; now: Date }) {
  const deadline = new Date(project.deadline);
  const hoursToDeadline = (deadline.getTime() - now.getTime()) / 3_600_000;
  const deadlineText = deadline.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="flex items-center gap-3">
        {before && (
          <>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Before</span>
              <VerdictChip verdict={before.verdict} bufferHours={before.bufferHours} size="md" />
            </div>
            <IconArrowRight size={18} className="mt-4 text-slate-400" />
          </>
        )}
        <div className="flex flex-col">
          {before && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">After</span>}
          <VerdictChip verdict={analysis.verdict} bufferHours={analysis.bufferHours} size={before ? 'md' : 'lg'} />
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Stat label="Work on the longest chain" value={fmtH(analysis.durationHours)} delta={before && analysis.durationHours - before.durationHours} lowerIsBetter />
        <Stat label="Team time left" value={fmtH(analysis.availableHours)} sub={hoursToDeadline > 0 ? `until ${deadlineText}` : 'Deadline has passed'} />
        <Stat
          label={analysis.bufferHours < 0 ? 'Short by' : 'Spare time'}
          value={fmtH(analysis.bufferHours)}
          tone={analysis.bufferHours < 0 ? 'bad' : analysis.verdict === 'at_risk' ? 'warn' : 'good'}
          delta={before && analysis.bufferHours - before.bufferHours}
        />
        <Stat label="Critical path" value={`${analysis.criticalPath.length} tasks`} />
      </dl>
    </div>
  );
}

function Stat({ label, value, sub, tone, delta, lowerIsBetter }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad'; delta?: number; lowerIsBetter?: boolean }) {
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.05;
  const better = showDelta && (lowerIsBetter ? delta! < 0 : delta! > 0);
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-800' : 'text-slate-900')}>
        {value}
        {showDelta && (
          <span className={cn('ml-1.5 text-xs font-semibold', better ? 'text-emerald-700' : 'text-red-700')}>
            {delta! > 0 ? '+' : '−'}
            {fmtH(delta!)} {better ? '(better)' : '(worse)'}
          </span>
        )}
        {sub && <span className="ml-1.5 text-xs font-normal text-slate-500">{sub}</span>}
      </dd>
    </div>
  );
}
