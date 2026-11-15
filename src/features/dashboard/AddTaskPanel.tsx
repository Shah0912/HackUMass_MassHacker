// Add a task straight from the graph: title, owner, estimate, and where it sits in the chain.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Project } from '@/core/types';
import { MAX_TASK_HOURS } from '@/core/split';
import { Button, DependencyPicker } from '@/components/ui';
import { OwnerSelect } from '@/components/people';
import { addMember, wouldCreateCycle, type NewTaskInput } from '@/store/taskOps';
import { IconAlert, IconPlus, IconX } from '@/components/icons';

export function AddTaskPanel({
  project,
  initialDependsOn,
  whatIf,
  onCancel,
  onCreate,
  onEdit,
}: {
  project: Project;
  /** Pre-filled "waits on" (e.g. "Add a task after this one"). */
  initialDependsOn: string[];
  whatIf: boolean;
  onCancel: () => void;
  onCreate: (input: NewTaskInput) => void;
  /** Whole-project edit, used to add a person who isn't on the team yet. */
  onEdit: (fn: (p: Project) => Project) => void;
}) {
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState('2');
  const [dependsOn, setDependsOn] = useState<string[]>(initialDependsOn);
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const options = useMemo(() => project.tasks.filter((t) => !t.cut).map((t) => ({ id: t.id, title: t.title || 'Untitled task' })), [project.tasks]);
  const hours = Number(estimate);
  const titleOk = title.trim().length > 0;
  const hoursOk = Number.isFinite(hours) && hours >= 0.25 && hours <= 80;
  const loop = wouldCreateCycle(project, dependsOn, unlocks);
  const parts = hoursOk && hours > MAX_TASK_HOURS ? Math.ceil(hours / MAX_TASK_HOURS) : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!titleOk || !hoursOk || loop) return;
    onCreate({ title, ownerId, estimateHours: hours, dependsOn, unlocks });
  };

  return (
    <aside aria-label="Add a task" className="absolute inset-0 z-20 flex flex-col bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
          <IconPlus size={16} /> Add a task{whatIf ? ' (what-if)' : ''}
        </h2>
        <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Close without adding (Esc)">
          <IconX size={16} />
        </Button>
      </div>

      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">What needs doing?</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Write the README"
              aria-invalid={tried && !titleOk}
              aria-describedby={tried && !titleOk ? 'add-title-err' : undefined}
              className={inputCls}
            />
            {tried && !titleOk && (
              <span id="add-title-err" className="mt-1 flex items-center gap-1 text-xs text-red-700">
                <IconAlert size={12} /> Give the task a title.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Owner</span>
              <OwnerSelect
                value={ownerId}
                members={project.members}
                onChange={setOwnerId}
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
              <span className="mb-1 block text-xs font-medium text-slate-500">Estimate (hours)</span>
              <input
                type="number"
                min={0.25}
                max={80}
                step={0.25}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                aria-invalid={!hoursOk}
                className={inputCls}
              />
            </label>
          </div>
          {!hoursOk && <p className="-mt-2 text-xs text-red-700">Use between 0.25 and 80 hours.</p>}
          {parts > 0 && (
            <p className="-mt-2 text-xs text-slate-600">
              Over {MAX_TASK_HOURS} h, so it will be added as {parts} linked parts of at most {MAX_TASK_HOURS} h each.
            </p>
          )}

          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Waits on (must finish first)</span>
            <DependencyPicker taskId="__new__" value={dependsOn} options={options} onChange={setDependsOn} />
          </div>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Unlocks (these will wait on the new task)</span>
            <DependencyPicker taskId="__new__" value={unlocks} options={options} onChange={setUnlocks} />
          </div>

          {loop && (
            <p role="alert" className="flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-sm text-red-800 ring-1 ring-red-200">
              <IconAlert size={14} className="mt-0.5 shrink-0" />
              That would make a loop: a task it unlocks already has to finish before something it waits on. Remove one of them.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loop}>
            <IconPlus size={14} /> Add task
          </Button>
        </div>
      </form>
    </aside>
  );
}

const inputCls =
  'block w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600 aria-[invalid=true]:ring-red-500';
