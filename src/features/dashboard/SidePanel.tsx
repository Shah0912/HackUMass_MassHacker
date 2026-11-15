// Right panel: Risks (ranked, with fixes), People (load), Rescue (AI plan, code-verified).
import { useRef, useState } from 'react';
import type { Analysis, Project, Risk } from '@/core/types';
import { fmtH } from '@/engine';
import { Button, Dot, LoadBar, cn } from '@/components/ui';
import { IconAlert, IconCheckCircle, IconClock, IconSparkle } from '@/components/icons';
import { RescuePanel } from '@/features/rescue/RescuePanel';
import { AddPersonForm, OwnerSelect } from '@/components/people';
import { addMember, updateTask } from '@/store/taskOps';
import type { RescueAction } from '@/ai/client';
import { isTaskDrag, readTaskDrag } from '@/features/whatif/drag';

export type Tab = 'risks' | 'people' | 'rescue';

export function SidePanel(props: {
  project: Project;
  analysis: Analysis;
  now: Date;
  tab: Tab;
  onTab: (t: Tab) => void;
  activeRiskId: string | null;
  onRisk: (r: Risk | null) => void;
  onTryFix: (r: Risk) => void;
  memberFilter: string | null;
  onMember: (id: string | null) => void;
  onTryAction: (a: RescueAction) => void;
  readOnly: boolean;
  onEdit: (fn: (p: Project) => Project) => void;
  /** What-if: person cards accept a dragged task. */
  whatIf?: boolean;
}) {
  const { tab, onTab } = props;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'risks', label: `Risks${props.analysis.risks.length ? ` (${props.analysis.risks.length})` : ''}` },
    { id: 'people', label: 'People' },
    { id: 'rescue', label: 'Rescue plan' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Insights" className="flex border-b border-slate-200 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium',
              tab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.id === 'rescue' && <IconSparkle size={13} className="mr-1 inline" />}
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto p-3">
        {tab === 'risks' && <Risks {...props} />}
        {tab === 'people' && <People {...props} />}
        {tab === 'rescue' && <RescuePanel project={props.project} now={props.now} onTry={props.onTryAction} readOnly={props.readOnly} />}
      </div>
    </div>
  );
}

const SEV = {
  high: { label: 'High', cls: 'bg-red-100 text-red-800', Icon: IconAlert },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-900', Icon: IconClock },
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-700', Icon: IconClock },
};

function Risks({ analysis, activeRiskId, onRisk, onTryFix, readOnly }: Parameters<typeof SidePanel>[0]) {
  if (analysis.risks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <IconCheckCircle size={28} className="text-emerald-600" />
        <p className="font-semibold text-slate-900">No risks found</p>
        <p className="max-w-60 text-sm text-slate-600">Nobody is overloaded and you have {fmtH(analysis.bufferHours)} to spare. Keep the linchpin moving.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-2.5">
      {analysis.risks.map((r, i) => {
        const s = SEV[r.severity];
        const active = activeRiskId === r.id;
        const canTry = !readOnly && r.suggestion && ['reassign', 'cut', 'assign'].includes(r.suggestion.kind);
        return (
          <li key={r.id}>
            <div className={cn('rounded-lg bg-white p-3 ring-1 transition', active ? 'ring-2 ring-amber-500' : 'ring-slate-200 hover:ring-slate-300')}>
              <button type="button" className="block w-full text-left" aria-pressed={active} onClick={() => onRisk(active ? null : r)}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold', s.cls)}>
                    <s.Icon size={11} /> {s.label}
                  </span>
                </div>
                <p className="font-semibold leading-snug text-slate-900">{r.title}</p>
                <p className="mt-1 text-sm text-slate-600">{r.detail}</p>
              </button>
              {r.suggestion && (
                <div className="mt-2.5 rounded-md bg-slate-50 p-2.5">
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">Fix: </span>
                    {r.suggestion.text}
                  </p>
                  {canTry && (
                    <Button size="sm" className="mt-2" onClick={() => onTryFix(r)}>
                      Try it in what-if
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function People({ project, analysis, memberFilter, onMember, onEdit, readOnly, whatIf }: Parameters<typeof SidePanel>[0]) {
  const [overId, setOverId] = useState<string | null>(null);
  const skipClick = useRef(false);
  const addPerson = (name: string, hoursPerDay = 4): string | null => {
    let id: string | null = null;
    onEdit((p) => {
      const r = addMember(p, name, hoursPerDay);
      id = r.id;
      return r.project;
    });
    return id;
  };
  const unassigned = project.tasks.filter((t) => !t.cut && t.status !== 'done' && !t.ownerId);
  const members = [...project.members].sort((a, b) => (analysis.members[b.id]?.loadRatio ?? 0) - (analysis.members[a.id]?.loadRatio ?? 0));
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-slate-500">
        {whatIf
          ? 'Drag a task onto a person to reassign it. Click a person to show only their tasks.'
          : 'Load = work left ÷ hours they have before the deadline. Click a person to show only their tasks.'}
      </p>
      {members.map((m) => {
        const mm = analysis.members[m.id];
        if (!mm) return null;
        const active = memberFilter === m.id;
        const pct = mm.loadRatio >= 99 ? null : Math.round(mm.loadRatio * 100);
        const status = mm.loadRatio > 1 ? 'Overloaded' : mm.loadRatio > 0.8 ? 'Stretched' : 'OK';
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (skipClick.current) {
                skipClick.current = false;
                return;
              }
              onMember(active ? null : m.id);
            }}
            onDragOver={(e) => {
              if (!whatIf || !isTaskDrag(e.dataTransfer)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverId(m.id);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setOverId((id) => (id === m.id ? null : id));
            }}
            onDrop={(e) => {
              if (!whatIf) return;
              const taskId = readTaskDrag(e.dataTransfer);
              e.preventDefault();
              setOverId(null);
              if (!taskId) return;
              skipClick.current = true;
              onEdit((p) => updateTask(p, taskId, { ownerId: m.id }));
            }}
            className={cn(
              'block w-full rounded-lg bg-white p-3 text-left ring-1 transition',
              overId === m.id ? 'bg-amber-50 ring-2 ring-amber-500' : active ? 'ring-2 ring-blue-600' : 'ring-slate-200 hover:ring-slate-300',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <Dot color={m.color} /> {m.name}
              </span>
              <span className={cn('text-sm font-semibold tabular-nums', mm.loadRatio > 1 ? 'text-red-700' : mm.loadRatio > 0.8 ? 'text-amber-800' : 'text-slate-700')}>
                {pct === null ? 'No hours' : `${pct}%`} · {status}
              </span>
            </div>
            <div className="mt-2">
              <LoadBar ratio={mm.loadRatio} label={`${m.name}: ${pct ?? 'no capacity'}% load`} />
            </div>
            {overId === m.id && <p className="mt-1.5 text-xs font-semibold text-amber-900">Drop to assign to {m.name}</p>}
            <p className="mt-1.5 text-xs text-slate-600">
              {fmtH(mm.remainingHours)} left of {fmtH(mm.capacityHours)} available · {mm.openTaskCount} open task{mm.openTaskCount === 1 ? '' : 's'}
              {mm.criticalHours > 0 && ` · ${fmtH(mm.criticalHours)} critical`}
            </p>
          </button>
        );
      })}
      {unassigned.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p>
            <IconAlert size={13} className="mr-1 inline" />
            {unassigned.length} unfinished task{unassigned.length > 1 ? 's have' : ' has'} no owner{readOnly ? '.' : '. Assign them:'}
          </p>
          {readOnly ? (
            <p className="mt-1">{unassigned.map((t) => t.title).join(', ')}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {unassigned.map((t) => (
                <li key={t.id}>
                  <p className="mb-1 font-medium text-slate-900">{t.title}</p>
                  <OwnerSelect
                    value={null}
                    members={project.members}
                    onChange={(ownerId) => ownerId && onEdit((p) => updateTask(p, t.id, { ownerId }))}
                    onAddMember={(name) => addPerson(name)}
                    label={`Owner of ${t.title}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!readOnly && (
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-slate-900">Missing someone?</p>
          <AddPersonForm onAdd={(name, h) => void addPerson(name, h)} />
        </div>
      )}
    </div>
  );
}
