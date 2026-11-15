// S5 Dashboard (+ S6 drawer via ?task=, S7 what-if via ?mode=whatif, S8 rescue tab).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '@/app/App';
import type { Project, Risk, Task } from '@/core/types';
import { analyse } from '@/engine';
import { applyRescueAction, type RescueAction } from '@/ai/client';
import { downloadProject, useStore } from '@/store/projects';
import { deleteTask, updateTask } from '@/store/taskOps';
import { Button, EmptyState, cn, useNow } from '@/components/ui';
import { IconAlert, IconArrowLeft, IconDownload, IconSparkle } from '@/components/icons';
import { GraphCanvas, type GraphView } from './GraphCanvas';
import { SidePanel, type Tab } from './SidePanel';
import { TaskDrawer } from './TaskDrawer';
import { VerdictBar } from './VerdictBar';
import { WhatIfChanges, diffProjects } from '@/features/whatif/WhatIfChanges';

export function DashboardPage() {
  const { id = '' } = useParams();
  const project = useStore((s) => s.projects[id]);
  if (!project) {
    return (
      <EmptyState title="Project not found" action={<Link className="text-blue-700 underline" to="/">Back to projects</Link>}>
        It may have been deleted, or it was saved in a different browser.
      </EmptyState>
    );
  }
  return <Dashboard key={id} project={project} />;
}

function Dashboard({ project }: { project: Project }) {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const whatIfState = useStore((s) => s.whatIf);
  const { updateProject, startWhatIf, updateWhatIf, applyWhatIf, discardWhatIf } = useStore.getState();

  const wantWhatIf = params.get('mode') === 'whatif';
  const whatIf = wantWhatIf && whatIfState?.projectId === project.id ? whatIfState : null;
  useEffect(() => {
    if (wantWhatIf && whatIfState?.projectId !== project.id) startWhatIf(project.id);
  }, [wantWhatIf, whatIfState, project.id, startWhatIf]);

  const working = whatIf?.draft ?? project;
  const analysis = useMemo(() => analyse(working, now), [working, now]);
  const before = useMemo(() => (whatIf ? analyse(project, now) : undefined), [whatIf, project, now]);
  const changes = useMemo(() => (whatIf ? diffProjects(project, whatIf.draft) : []), [whatIf, project]);

  const selectedTaskId = params.get('task');
  const [tab, setTab] = useState<Tab>('risks');
  const [activeRisk, setActiveRisk] = useState<Risk | null>(null);
  const [view, setView] = useState<GraphView>({ colorBy: 'owner', hideDone: false, criticalOnly: false, memberFilter: null });

  // One URL update per action: two setParams calls in a row would overwrite each other.
  const setUrl = useCallback(
    (patch: Record<string, string | null>, replace = false) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace },
      ),
    [setParams],
  );
  const selectTask = useCallback((tid: string | null) => setUrl({ task: tid }, true), [setUrl]);

  const edit = (fn: (p: Project) => Project) => (whatIf ? updateWhatIf(fn) : updateProject(project.id, fn));
  const enterWhatIf = (fn?: (p: Project) => Project, taskId?: string) => {
    startWhatIf(project.id, fn);
    setUrl({ mode: 'whatif', ...(taskId ? { task: taskId } : {}) });
  };
  const leaveWhatIf = (apply: boolean) => {
    if (apply) applyWhatIf();
    else discardWhatIf();
    setUrl({ mode: null });
  };

  const tryRiskFix = (r: Risk) => {
    const s = r.suggestion;
    if (!s) return;
    const patch: Partial<Task> = s.kind === 'cut' ? { cut: true } : { ownerId: s.toMemberId ?? null };
    enterWhatIf((p) => updateTask(p, s.taskId, patch), s.taskId);
  };
  const tryRescue = (a: RescueAction) => enterWhatIf((p) => applyRescueAction(p, a), a.taskId);

  const highlightTaskIds = useMemo(() => new Set(activeRisk?.taskIds ?? []), [activeRisk]);

  return (
    <div className={cn('flex h-screen flex-col', whatIf && 'ring-8 ring-inset ring-amber-400')}>
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
        <Logo />
        <span className="text-slate-300">/</span>
        <h1 className="truncate font-semibold text-slate-900">{project.name}</h1>
        {whatIf && <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">What-if</span>}
        <div className="ml-auto flex items-center gap-2">
          {!whatIf && (
            <>
              <Link to={`/p/${project.id}/review`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm text-slate-700 hover:bg-slate-100">
                <IconArrowLeft size={14} /> Edit as table
              </Link>
              <Button size="sm" variant="ghost" onClick={() => downloadProject(project)}>
                <IconDownload size={14} /> Export
              </Button>
              <Button size="sm" variant="primary" onClick={() => enterWhatIf()}>
                <IconSparkle size={14} /> What-if
              </Button>
            </>
          )}
        </div>
      </header>

      <section aria-label="Verdict" className={cn('border-b px-5 py-3', whatIf ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
        {analysis.valid ? (
          <VerdictBar project={working} analysis={analysis} before={before} now={now} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-red-800">
            <IconAlert size={16} />
            {analysis.issues.filter((i) => i.level === 'error').length} problem(s) stop the schedule from being worked out: {analysis.issues.find((i) => i.level === 'error')?.message}
            {!whatIf && (
              <Link to={`/p/${project.id}/review`} className="font-semibold underline">
                Fix on the review screen
              </Link>
            )}
          </p>
        )}
        {whatIf && (
          <div className="mt-3 flex items-start justify-between gap-4">
            <WhatIfChanges changes={changes} onUndo={(c) => updateWhatIf(c.revert)} onSelect={selectTask} />
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => leaveWhatIf(false)}>Discard</Button>
              <Button variant="primary" disabled={changes.length === 0} onClick={() => leaveWhatIf(true)}>
                Apply {changes.length > 0 ? `${changes.length} change${changes.length > 1 ? 's' : ''}` : ''}
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="flex min-h-0 flex-1">
        <main id="main" className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar view={view} setView={setView} project={working} />
          <div className="relative min-h-0 flex-1">
            {analysis.valid ? (
              <GraphCanvas
                project={working}
                analysis={analysis}
                view={view}
                selectedTaskId={selectedTaskId}
                highlightTaskIds={highlightTaskIds}
                onSelectTask={selectTask}
                reassignable={!!whatIf}
                onReassignDragStart={() => {
                  setTab('people');
                  selectTask(null);
                }}
              />
            ) : (
              <EmptyState title="The graph can't be drawn yet">Fix the problems above, then come back.</EmptyState>
            )}
            <Legend />
          </div>
        </main>

        <aside aria-label="Insights" className="relative w-[380px] shrink-0 border-l border-slate-200 bg-slate-50">
          {analysis.valid && (
            <SidePanel
              project={working}
              analysis={analysis}
              now={now}
              tab={tab}
              onTab={setTab}
              activeRiskId={activeRisk?.id ?? null}
              onRisk={setActiveRisk}
              onTryFix={tryRiskFix}
              memberFilter={view.memberFilter}
              onMember={(m) => setView((v) => ({ ...v, memberFilter: m }))}
              onTryAction={tryRescue}
              readOnly={false}
              whatIf={!!whatIf}
              onEdit={edit}
            />
          )}
          {selectedTaskId && working.tasks.some((t) => t.id === selectedTaskId) && (
            <TaskDrawer
              project={working}
              analysis={analysis}
              taskId={selectedTaskId}
              whatIf={!!whatIf}
              onClose={() => selectTask(null)}
              onSelect={selectTask}
              onChange={(patch) => edit((p) => updateTask(p, selectedTaskId, patch))}
              onEdit={edit}
              onDelete={() => {
                edit((p) => deleteTask(p, selectedTaskId));
                selectTask(null);
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Toolbar({ view, setView, project }: { view: GraphView; setView: (fn: (v: GraphView) => GraphView) => void; project: Project }) {
  const toggle = (k: 'hideDone' | 'criticalOnly') => setView((v) => ({ ...v, [k]: !v[k] }));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">Colour nodes by</legend>
        <span className="mr-1 text-slate-500">Colour by</span>
        {(['owner', 'status'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={view.colorBy === c}
            onClick={() => setView((v) => ({ ...v, colorBy: c }))}
            className={cn('rounded-md px-2 py-1 capitalize', view.colorBy === c ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}
          >
            {c}
          </button>
        ))}
      </fieldset>
      <label className="flex items-center gap-1.5 text-slate-700">
        <span className="text-slate-500">Person</span>
        <select value={view.memberFilter ?? ''} onChange={(e) => setView((v) => ({ ...v, memberFilter: e.target.value || null }))} className="rounded-md bg-white px-1.5 py-1 ring-1 ring-slate-300">
          <option value="">Everyone</option>
          {project.members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-slate-700">
        <input type="checkbox" checked={view.hideDone} onChange={() => toggle('hideDone')} /> Hide done
      </label>
      <label className="flex items-center gap-1.5 text-slate-700">
        <input type="checkbox" checked={view.criticalOnly} onChange={() => toggle('criticalOnly')} /> Critical path only
      </label>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-700 shadow ring-1 ring-slate-200">
      <p className="flex items-center gap-2">
        <span className="inline-block h-0 w-6 border-t-[3.5px] border-slate-900" /> Critical path (thick border, "Critical" tag)
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="inline-block h-3 w-6 rounded-sm bg-red-600" /> Linchpin: the task most others wait on
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="inline-block h-3 w-6 rounded-sm border-2 border-dashed border-slate-400" /> Done
      </p>
      <p className="mt-1 text-slate-500">Click a task to see its chain. Arrows point to what comes next.</p>
    </div>
  );
}
