// S6 Task drawer: edit one task, see its schedule numbers, jump along its chain.
import { useEffect, useRef } from 'react';
import type { Analysis, Project, Task, TaskStatus } from '@/core/types';
import { fmtH } from '@/engine';
import { Button, DependencyPicker, Dot, STATUS_LABEL, StatusBadge, cn } from '@/components/ui';
import { OwnerSelect } from '@/components/people';
import { addMember } from '@/store/taskOps';
import { IconCheck, IconFlag, IconPin, IconPlus, IconQuote, IconScissors, IconTrash, IconUndo, IconX } from '@/components/icons';

export function TaskDrawer({
  project,
  analysis,
  taskId,
  onClose,
  onSelect,
  onChange,
  onDelete,
  onEdit,
  onAddAfter,
  whatIf,
}: {
  project: Project;
  analysis: Analysis;
  taskId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onChange: (patch: Partial<Task>) => void;
  onDelete: () => void;
  /** Whole-project edit (used to add a person the AI missed). */
  onEdit: (fn: (p: Project) => Project) => void;
  /** Open the add-task panel with this task pre-filled as "waits on". */
  onAddAfter: () => void;
  whatIf: boolean;
}) {
  const task = project.tasks.find((t) => t.id === taskId);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [taskId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!task) return null;
  const m = analysis.tasks[task.id];
  const blockedBy = task.dependsOn.map((id) => project.tasks.find((t) => t.id === id)).filter(Boolean) as Task[];
  const blocks = project.tasks.filter((t) => t.dependsOn.includes(task.id) && !t.cut);
  const options = project.tasks.filter((t) => !t.cut).map((t) => ({ id: t.id, title: t.title }));
  const isBottleneck = analysis.bottleneckTaskId === task.id;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={`Task: ${task.title}`}
      className="absolute inset-0 z-20 flex flex-col bg-white shadow-xl outline-none"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {isBottleneck && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
              <IconPin size={11} /> Bottleneck
            </span>
          )}
          {m?.isCritical && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              <IconFlag size={11} /> Critical
            </span>
          )}
          {task.cut && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">Cut from scope</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close task details (Esc)">
          <IconX size={16} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label htmlFor="drawer-title" className="sr-only">Title</label>
          <textarea
            id="drawer-title"
            value={task.title}
            rows={2}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full resize-none rounded-md px-2 py-1 text-lg font-semibold leading-snug text-slate-900 ring-1 ring-transparent hover:ring-slate-200 focus:outline-2 focus:outline-blue-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Owner</span>
            <OwnerSelect
              value={task.ownerId}
              members={project.members}
              onChange={(ownerId) => onChange({ ownerId })}
              onAddMember={(name) => {
                let id: string | null = null;
                onEdit((p) => {
                  const r = addMember(p, name);
                  id = r.id;
                  return r.project;
                });
                return id;
              }}
              label="Owner"
            />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
            <select value={task.status} onChange={(e) => onChange({ status: e.target.value as TaskStatus })} className={inputCls}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block text-sm">
            <span className="mb-1 flex justify-between text-xs font-medium text-slate-500">
              Estimate <span className="tabular-nums text-slate-800">{fmtH(task.estimateHours)}{task.estimateInferred ? ' (guessed by AI)' : ''}</span>
            </span>
            {whatIf ? (
              <input
                type="range"
                min={0.25}
                max={Math.max(16, task.estimateHours * 2)}
                step={0.25}
                value={task.estimateHours}
                onChange={(e) => onChange({ estimateHours: Number(e.target.value), estimateInferred: false })}
                className="w-full"
                aria-label="Estimate in hours"
              />
            ) : (
              <input
                type="number"
                min={0.25}
                max={80}
                step={0.25}
                value={task.estimateHours}
                onChange={(e) => onChange({ estimateHours: Number(e.target.value), estimateInferred: false })}
                className={inputCls}
              />
            )}
          </label>
          <div className="col-span-2 text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Waits on</span>
            <DependencyPicker taskId={task.id} value={task.dependsOn} options={options} onChange={(deps) => onChange({ dependsOn: deps })} />
          </div>
        </div>

        {m && (
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <Metric label="Work left" value={fmtH(m.remainingHours)} />
            <Metric label="Can start in" value={m.earliestStart < 0.05 ? 'Now' : fmtH(m.earliestStart)} />
            <Metric label="Slack" value={m.slackHours < 0.01 ? 'None' : fmtH(m.slackHours)} strong={m.slackHours < 0.01} />
            <Metric label="Tasks waiting on it" value={String(m.downstreamCount)} strong={m.downstreamCount >= 3} />
          </dl>
        )}

        <ChainList title="Blocked by" tasks={blockedBy} project={project} onSelect={onSelect} empty="Nothing. It can start now." />
        <ChainList title="Blocks" tasks={blocks} project={project} onSelect={onSelect} empty="Nothing waits on this task." />

        {task.evidence && (
          <figure>
            <figcaption className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <IconQuote size={12} /> From your notes
            </figcaption>
            <blockquote className="border-l-4 border-slate-300 pl-3 text-sm italic text-slate-700">"{task.evidence}"</blockquote>
          </figure>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 p-3">
        <Button onClick={onAddAfter} title="Add a new task that waits on this one">
          <IconPlus size={14} /> Add task after this
        </Button>
        {whatIf && task.status !== 'done' && (
          <Button onClick={() => onChange({ status: 'done' })}>
            <IconCheck size={14} /> Mark done
          </Button>
        )}
        <Button onClick={() => onChange({ cut: !task.cut })}>
          {task.cut ? <IconUndo size={14} /> : <IconScissors size={14} />} {task.cut ? 'Restore to scope' : 'Cut from scope'}
        </Button>
        {!whatIf && (
          <Button variant="danger" onClick={onDelete}>
            <IconTrash size={14} /> Delete
          </Button>
        )}
      </div>
    </aside>
  );
}

const inputCls = 'block w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600';

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold text-slate-900' : 'text-slate-800')}>{value}</dd>
    </div>
  );
}

function ChainList({ title, tasks, project, onSelect, empty }: { title: string; tasks: Task[]; project: Project; onSelect: (id: string) => void; empty: string }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-slate-500">
        {title} ({tasks.length})
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onSelect(t.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ring-1 ring-slate-200 hover:bg-slate-50">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Dot color={project.members.find((m) => m.id === t.ownerId)?.color ?? '#cbd5e1'} size={8} />
                  <span className="truncate">{t.title}</span>
                </span>
                <StatusBadge status={t.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
