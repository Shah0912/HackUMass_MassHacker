// S4 Review tasks: correct what the AI got wrong before trusting the graph.
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Logo } from '@/app/App';
import type { Project, Task, TaskStatus } from '@/core/types';
import { validate } from '@/engine';
import { useStore } from '@/store/projects';
import { addMember, addTask, deleteTask, removeMember, sortedTasks, splitTaskInProject, updateMember, updateTask } from '@/store/taskOps';
import { isOversized, MAX_TASK_HOURS } from '@/core/split';
import { OwnerSelect, TeamEditor } from '@/components/people';
import { Button, ConfidenceBadge, DependencyPicker, EmptyState, STATUS_LABEL, cn } from '@/components/ui';
import { IconAlert, IconArrowLeft, IconArrowRight, IconPlus, IconQuote, IconTrash } from '@/components/icons';

export function ReviewPage() {
  const { id = '' } = useParams();
  const project = useStore((s) => s.projects[id]);
  const updateProject = useStore((s) => s.updateProject);
  const navigate = useNavigate();

  if (!project) {
    return <EmptyState title="Project not found" action={<Link className="text-blue-700 underline" to="/">Back to projects</Link>}>It may have been deleted, or it was saved in a different browser.</EmptyState>;
  }
  const edit = (fn: (p: Project) => Project) => updateProject(id, fn);
  return <ReviewTable project={project} edit={edit} onShowGraph={() => navigate(`/p/${id}`)} />;
}

function ReviewTable({ project, edit, onShowGraph }: { project: Project; edit: (fn: (p: Project) => Project) => void; onShowGraph: () => void }) {
  const issues = useMemo(() => validate(project), [project]);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const tasks = sortedTasks(project).filter((t) => !t.cut);
  const depCount = tasks.reduce((s, t) => s + t.dependsOn.length, 0);
  const flagged = tasks.filter((t) => t.source === 'ai' && (t.confidence === 'low' || t.estimateInferred)).length;
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const options = tasks.map((t) => ({ id: t.id, title: t.title }));
  const issueRows = new Map<string, 'error' | 'warning'>();
  for (const i of issues) for (const tid of i.taskIds) if (issueRows.get(tid) !== 'error') issueRows.set(tid, i.level);

  const focusRow = (taskId: string | undefined) => {
    if (!taskId) return;
    const el = document.getElementById(`title-${taskId}`) as HTMLInputElement | null;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus();
  };

  const set = (taskId: string, patch: Partial<Task>) => edit((p) => updateTask(p, taskId, patch));
  const addPerson = (name: string, hoursPerDay = 4): string | null => {
    let newId: string | null = null;
    edit((p) => {
      const r = addMember(p, name, hoursPerDay);
      newId = r.id;
      return r.project;
    });
    return newId;
  };
  const unowned = tasks.filter((t) => !t.ownerId && t.status !== 'done').length;
  const oversized = tasks.filter((t) => isOversized(t));
  const taskCounts: Record<string, number> = {};
  for (const t of tasks) if (t.ownerId) taskCounts[t.ownerId] = (taskCounts[t.ownerId] ?? 0) + 1;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <Logo />
          <span className="text-slate-300">/</span>
          <h1 className="truncate font-semibold text-slate-900">{project.name}</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Review tasks</span>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        {/* Banner */}
        <section aria-labelledby="summary" className="mb-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h2 id="summary" className="text-lg font-semibold text-slate-900">
            Found {tasks.length} tasks and {depCount} dependencies.{' '}
            {flagged > 0 ? <span className="font-normal text-slate-700">Check the {flagged} flagged rows.</span> : <span className="font-normal text-slate-700">Check anything that looks off.</span>}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">The AI is checked, not trusted. Every edit you make here is marked as yours.</p>
          {oversized.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
              <IconAlert size={14} className="shrink-0" />
              <span>
                <strong className="font-semibold">Check:</strong> {oversized.length} task{oversized.length > 1 ? 's are' : ' is'} over {MAX_TASK_HOURS} h. Break big work into smaller tasks so progress is visible.
              </span>
              <Button size="sm" onClick={() => edit((p) => oversized.reduce((acc, t) => splitTaskInProject(acc, t.id), p))}>
                Split all
              </Button>
            </div>
          )}
          {issues.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {[...errors, ...warnings].map((i, k) => (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => focusRow(i.taskIds[0])}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:underline',
                      i.level === 'error' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900',
                    )}
                  >
                    <IconAlert size={14} className="mt-0.5 shrink-0" />
                    <span>
                      <strong className="font-semibold">{i.level === 'error' ? 'Must fix:' : 'Check:'}</strong> {i.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Team: add anyone the AI missed, fix hours */}
        <section aria-labelledby="team" className="mb-5 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="team" className="font-semibold text-slate-900">Team ({project.members.length})</h2>
            <p className="text-sm text-slate-600">
              {unowned > 0 ? (
                <span className="text-amber-800">{unowned} task{unowned > 1 ? 's have' : ' has'} no owner. </span>
              ) : null}
              Missing someone? Add them here, or pick <span className="font-medium">+ Add person…</span> in any Owner box.
            </p>
          </div>
          <TeamEditor
            members={project.members}
            taskCounts={taskCounts}
            onUpdate={(mid, patch) => edit((p) => updateMember(p, mid, patch))}
            onRemove={(mid) => edit((p) => removeMember(p, mid))}
            onAdd={(name, h) => void addPerson(name, h)}
          />
        </section>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[1100px] table-fixed text-sm">
            <caption className="sr-only">Tasks extracted from your notes. Edit any field.</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="w-[26%] px-3 py-2">Task</th>
                <th scope="col" className="w-40 px-3 py-2">Owner</th>
                <th scope="col" className="w-28 px-3 py-2">Estimate</th>
                <th scope="col" className="w-36 px-3 py-2">Status</th>
                <th scope="col" className="w-[22%] px-3 py-2">Waits on</th>
                <th scope="col" className="w-36 px-3 py-2">Confidence</th>
                <th scope="col" className="w-24 px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => {
                const issue = issueRows.get(t.id);
                const low = t.source === 'ai' && t.confidence === 'low';
                return (
                  <Fragment key={t.id}>
                    <tr className={cn('align-top', issue === 'error' ? 'bg-red-50/60' : low ? 'bg-amber-50/50' : '')}>
                      <td className="px-3 py-2">
                        <input
                          id={`title-${t.id}`}
                          value={t.title}
                          onChange={(e) => set(t.id, { title: e.target.value })}
                          aria-label={`Title of task ${t.id}`}
                          placeholder="Describe the task"
                          className={cellInput}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <OwnerSelect
                          value={t.ownerId}
                          members={project.members}
                          onChange={(ownerId) => set(t.id, { ownerId })}
                          onAddMember={(name) => addPerson(name)}
                          label={`Owner of ${t.title || t.id}`}
                        />
                        {!t.ownerId && t.status !== 'done' && <p className="mt-1 text-xs text-amber-800">No owner yet</p>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0.25}
                            max={80}
                            step={0.25}
                            value={t.estimateHours}
                            onChange={(e) => set(t.id, { estimateHours: Number(e.target.value), estimateInferred: false })}
                            aria-label={`Estimate in hours for ${t.title || t.id}`}
                            className={cn(cellInputBase, 'w-20')}
                          />
                          <span className="text-slate-500">h</span>
                        </div>
                        {t.estimateInferred && <p className="mt-1 text-xs text-amber-800">Guessed by AI</p>}
                        {isOversized(t) && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-800">
                            <IconAlert size={12} /> Over {MAX_TASK_HOURS} h
                            <button
                              type="button"
                              onClick={() => edit((p) => splitTaskInProject(p, t.id))}
                              className="font-semibold underline underline-offset-2 hover:text-amber-950"
                              aria-label={`Split ${t.title || t.id} into tasks of at most ${MAX_TASK_HOURS} hours`}
                            >
                              Split
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select value={t.status} onChange={(e) => set(t.id, { status: e.target.value as TaskStatus })} aria-label={`Status of ${t.title || t.id}`} className={cellInput}>
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <DependencyPicker compact taskId={t.id} value={t.dependsOn} options={options} onChange={(deps) => set(t.id, { dependsOn: deps })} />
                      </td>
                      <td className="px-3 py-2 pt-3">
                        <ConfidenceBadge task={t} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {t.evidence && (
                            <Button size="sm" variant="ghost" aria-expanded={openEvidence === t.id} onClick={() => setOpenEvidence((o) => (o === t.id ? null : t.id))} aria-label={`Show evidence for ${t.title}`}>
                              <IconQuote size={14} />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => edit((p) => deleteTask(p, t.id))} aria-label={`Delete ${t.title || t.id}`}>
                            <IconTrash size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {openEvidence === t.id && t.evidence && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-3 py-2">
                          <blockquote className="border-l-4 border-slate-300 pl-3 text-sm italic text-slate-700">"{t.evidence}"</blockquote>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {tasks.length === 0 && <p className="p-6 text-center text-sm text-slate-600">No tasks yet. Add the first one below.</p>}
          <div className="border-t border-slate-100 p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                let newId = '';
                edit((p) => {
                  const r = addTask(p);
                  newId = r.id;
                  return r.project;
                });
                setTimeout(() => document.getElementById(`title-${newId}`)?.focus(), 0);
              }}
            >
              <IconPlus size={14} /> Add task
            </Button>
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/new" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <IconArrowLeft size={14} /> Start over with new notes
          </Link>
          <div className="flex items-center gap-3">
            {errors.length > 0 && (
              <span className="text-sm text-red-800">
                Fix {errors.length} problem{errors.length > 1 ? 's' : ''} to see the graph
              </span>
            )}
            <Button variant="primary" size="lg" disabled={errors.length > 0} onClick={onShowGraph}>
              Show graph <IconArrowRight size={18} />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

const cellInputBase = 'block rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600';
const cellInput = `${cellInputBase} w-full`;
