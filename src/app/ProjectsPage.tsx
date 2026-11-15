// S1 Projects (landing): new project, try the sample, saved list, export/delete.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from './App';
import { analyse } from '@/engine';
import { downloadProject, useStore } from '@/store/projects';
import { Button, Card, VerdictChip, useNow } from '@/components/ui';
import { IconArrowRight, IconBolt, IconDownload, IconPlus, IconTrash } from '@/components/icons';

export function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const loadSample = useStore((s) => s.loadSample);
  const deleteProject = useStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const now = useNow();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const list = useMemo(
    () =>
      Object.values(projects)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ p, a: analyse(p, now, { withRisks: false }) })),
    [projects, now],
  );

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
      </header>

      <main id="main" className="mx-auto max-w-5xl px-6 pb-16">
        <section className="py-10">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900">Turn a messy meeting or a rough idea into a real plan.</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            You don't need a finished plan to start. A one-line idea and your team size is enough, and so is a messy meeting transcript or a feature doc. ClearPath fills
            in the tasks, who's doing what, how long each takes and what waits on what, then tells you whether you'll make the deadline.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            For example: <span className="italic">"A habit tracker app where friends keep each other on track. 3 of us, due Sunday."</span>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" variant="primary" onClick={() => navigate('/new')}>
              <IconPlus size={18} /> New project
            </Button>
            <Button size="lg" onClick={() => navigate(`/p/${loadSample()}`)}>
              <IconBolt size={18} /> Try the sample
            </Button>
          </div>
        </section>

        <section aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Saved projects
          </h2>
          {list.length === 0 ? (
            <Card className="p-8 text-center text-slate-600">
              <p className="font-medium text-slate-800">No projects yet.</p>
              <p className="mt-1 text-sm">
                Start a new project from your team's notes, or try the sample to see a project that's running late. Everything
                stays in this browser.
              </p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {list.map(({ p, a }) => (
                  <li key={p.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/p/${p.id}`} className="block truncate font-medium text-slate-900 hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-sm text-slate-500">
                        {p.tasks.filter((t) => !t.cut).length} tasks · {p.members.length} people · updated{' '}
                        {new Date(p.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    {a.valid ? (
                      <VerdictChip verdict={a.verdict} bufferHours={a.bufferHours} size="sm" />
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Needs review</span>
                    )}
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => downloadProject(p)} aria-label={`Export ${p.name}`}>
                        <IconDownload size={14} /> Export
                      </Button>
                      {confirmDelete === p.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => (deleteProject(p.id), setConfirmDelete(null))}>
                            Delete for good
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p.id)} aria-label={`Delete ${p.name}`}>
                          <IconTrash size={14} />
                        </Button>
                      )}
                      <Link
                        to={a.valid ? `/p/${p.id}` : `/p/${p.id}/review`}
                        className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        Open <IconArrowRight size={14} />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
