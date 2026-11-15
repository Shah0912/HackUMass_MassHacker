// S2 Intake + S3 Extracting. The form persists as a draft; extraction never loses the text.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/app/App';
import { ApiClientError, extractProject, MOCK_AI } from '@/ai/client';
import { LIMITS } from '@/core/types';
import { sampleRawInput } from '@/mocks/sampleProject';
import { useStore } from '@/store/projects';
import { Button, Card, cn } from '@/components/ui';
import { IconAlert, IconArrowLeft, IconCheck, IconPlus, IconSpinner, IconTrash, IconUpload, IconX } from '@/components/icons';

const STEPS = ['Reading your notes', 'Finding tasks', 'Linking dependencies', 'Checking the graph'];

type Phase = { kind: 'form' } | { kind: 'extracting'; step: number } | { kind: 'error'; code: string; message: string; retryable: boolean };

export function IntakePage() {
  const draft = useStore((s) => s.intakeDraft);
  const setDraft = useStore((s) => s.setIntakeDraft);
  const resetDraft = useStore((s) => s.resetIntakeDraft);
  const saveProject = useStore((s) => s.saveProject);
  const loadSample = useStore((s) => s.loadSample);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [touched, setTouched] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const chars = draft.text.length;
  const tooLong = chars > LIMITS.maxChars;
  const deadlineMs = Date.parse(draft.deadline);
  const deadlineOk = !Number.isNaN(deadlineMs) && deadlineMs > Date.now();
  const hoursOk = draft.workHoursPerDay > 0 && draft.workHoursPerDay <= 24;
  const canAnalyse = draft.text.trim().length > 0 && !tooLong && deadlineOk && hoursOk;

  const analyseNow = async () => {
    setTouched(true);
    if (!canAnalyse) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'extracting', step: 0 });
    timerRef.current = setInterval(() => {
      setPhase((p) => (p.kind === 'extracting' && p.step < STEPS.length - 1 ? { ...p, step: p.step + 1 } : p));
    }, 650);
    try {
      const project = await extractProject(
        {
          name: draft.name,
          text: draft.text,
          deadline: new Date(deadlineMs).toISOString(),
          workHoursPerDay: draft.workHoursPerDay,
          members: draft.members.filter((m) => m.name.trim()),
          detectMembers: draft.detectMembers,
        },
        controller.signal,
      );
      const id = saveProject(project);
      resetDraft();
      navigate(`/p/${id}/review`);
    } catch (err) {
      if (controller.signal.aborted) return;
      const e = err instanceof ApiClientError ? err : new ApiClientError('UPSTREAM_ERROR', 'Something went wrong. Your text is safe; try again.', true);
      setPhase({ kind: 'error', code: e.code, message: e.message, retryable: e.retryable });
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase({ kind: 'form' });
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name)) return;
    setDraft({ text: await file.text() });
  };

  const updateMember = (i: number, patch: Partial<{ name: string; hoursPerDay: number }>) =>
    setDraft({ members: draft.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <IconArrowLeft size={14} /> Projects
        </Link>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="mb-1 text-2xl font-bold tracking-tight">New project</h1>
        <p className="mb-6 text-slate-600">Paste a chat export, brief or to-do list. Messy is fine.</p>

        {phase.kind === 'extracting' && <Extracting step={phase.step} onCancel={cancel} />}
        {phase.kind === 'error' && (
          <Card className="mx-auto max-w-xl p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-red-600">
                <IconAlert size={22} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">We couldn't read your notes</h2>
                <p className="mt-1 text-sm text-slate-700">{phase.message}</p>
                <p className="mt-1 text-xs text-slate-500">Error code: {phase.code}. Your text has been kept.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {phase.retryable && (
                    <Button variant="primary" onClick={analyseNow}>
                      Try again
                    </Button>
                  )}
                  <Button onClick={() => setPhase({ kind: 'form' })}>Edit text</Button>
                  <Button variant="ghost" onClick={() => navigate(`/p/${loadSample()}`)}>
                    Use sample instead
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {phase.kind === 'form' && (
          <form
            className="grid grid-cols-1 gap-6 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              analyseNow();
            }}
          >
            {/* Left: raw text */}
            <div className="lg:col-span-2">
              <div className="mb-1.5 flex items-end justify-between">
                <label htmlFor="raw" className="text-sm font-medium text-slate-800">
                  Project notes <span className="text-red-700">*</span>
                </label>
                <button type="button" className="text-sm text-blue-700 underline-offset-2 hover:underline" onClick={() => setDraft({ text: sampleRawInput, name: draft.name || 'Campus Eats' })}>
                  Paste the sample chat
                </button>
              </div>
              <div
                className={cn('relative rounded-xl ring-1 transition', dragOver ? 'ring-2 ring-blue-500' : tooLong ? 'ring-red-400' : 'ring-slate-300')}
                onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  readFile(e.dataTransfer.files[0]);
                }}
              >
                <textarea
                  id="raw"
                  value={draft.text}
                  onChange={(e) => setDraft({ text: e.target.value })}
                  placeholder={'[Mon 9:14 PM] Sam: I\'ll do the backend, db schema first...\n[Mon 9:15 PM] Priya: I can\'t start the menu screen until the API exists'}
                  aria-describedby="raw-help raw-count"
                  aria-invalid={tooLong || (touched && !draft.text.trim())}
                  className="block h-[440px] w-full resize-y rounded-xl bg-white p-4 font-mono text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                {dragOver && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-blue-50/90 text-blue-800">
                    <IconUpload size={20} /> <span className="ml-2 font-medium">Drop a .txt, .md or .csv file</span>
                  </div>
                )}
              </div>
              <div className="mt-1.5 flex items-start justify-between gap-4 text-sm">
                <p id="raw-help" className={cn(tooLong ? 'text-red-700' : 'text-slate-500')}>
                  {tooLong
                    ? `That's ${(chars - LIMITS.maxChars).toLocaleString()} characters over the limit. Trim it down; nothing has been cut.`
                    : touched && !draft.text.trim()
                      ? <span className="text-red-700">Paste some notes to analyse.</span>
                      : 'You can also drop a .txt, .md or .csv file here.'}
                </p>
                <p id="raw-count" className={cn('shrink-0 tabular-nums', tooLong ? 'font-semibold text-red-700' : 'text-slate-500')}>
                  {chars.toLocaleString()} / {LIMITS.maxChars.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Right: settings */}
            <div className="space-y-5">
              <Card className="space-y-4 p-4">
                <Field label="Project name" htmlFor="name" hint="Optional">
                  <input id="name" value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} className={inputCls} placeholder="e.g. Campus Eats" />
                </Field>
                <Field label="Deadline" htmlFor="deadline" required error={touched && !deadlineOk ? 'Pick a date and time in the future.' : undefined}>
                  <input id="deadline" type="datetime-local" value={draft.deadline} onChange={(e) => setDraft({ deadline: e.target.value })} className={inputCls} aria-invalid={touched && !deadlineOk} />
                </Field>
                <Field label="Team work hours per day" htmlFor="whpd" hint="Hours a day the team can work" error={!hoursOk ? 'Enter between 1 and 24.' : undefined}>
                  <input id="whpd" type="number" min={1} max={24} step={0.5} value={draft.workHoursPerDay} onChange={(e) => setDraft({ workHoursPerDay: Number(e.target.value) })} className={cn(inputBase, 'w-24')} />
                </Field>
              </Card>

              <Card className="p-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-slate-800">Team members</legend>
                  <ul className="space-y-2">
                    {draft.members.map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <input aria-label={`Member ${i + 1} name`} value={m.name} onChange={(e) => updateMember(i, { name: e.target.value })} placeholder="Name" className={cn(inputBase, 'min-w-0 flex-1')} />
                        <input aria-label={`Member ${i + 1} hours per day`} type="number" min={0} max={24} step={0.5} value={m.hoursPerDay} onChange={(e) => updateMember(i, { hoursPerDay: Number(e.target.value) })} className={cn(inputBase, 'w-16 shrink-0')} />
                        <span className="text-xs text-slate-500">h/day</span>
                        <Button size="sm" variant="ghost" aria-label={`Remove member ${i + 1}`} onClick={() => setDraft({ members: draft.members.filter((_, j) => j !== i) })}>
                          <IconTrash size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => setDraft({ members: [...draft.members, { name: '', hoursPerDay: 4 }] })}>
                    <IconPlus size={14} /> Add member
                  </Button>
                  <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={draft.detectMembers} onChange={(e) => setDraft({ detectMembers: e.target.checked })} />
                    Detect members from the text too
                  </label>
                </fieldset>
              </Card>

              <div>
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canAnalyse && touched}>
                  Analyse
                </Button>
                {!canAnalyse && !touched && <p className="mt-2 text-center text-xs text-slate-500">Needs notes and a future deadline.</p>}
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  {MOCK_AI
                    ? 'Mock mode: nothing leaves your browser. '
                    : 'Your text is sent to an AI service to find tasks. It is not stored on our server. '}
                  Projects are saved only in this browser.
                </p>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

const inputBase =
  'block rounded-md bg-white px-2.5 py-1.5 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600 aria-[invalid=true]:ring-red-400';
const inputCls = `${inputBase} w-full`;

function Field({ label, htmlFor, hint, error, required, children }: { label: string; htmlFor: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-red-700">*</span>}
        {hint && <span className="ml-1 font-normal text-slate-500">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Extracting({ step, onCancel }: { step: number; onCancel: () => void }) {
  return (
    <Card className="mx-auto max-w-md p-6" >
      <h2 className="font-semibold text-slate-900">Mapping your project</h2>
      <p className="mt-1 text-sm text-slate-600">This usually takes 10 to 30 seconds.</p>
      <ol className="mt-5 space-y-3" aria-live="polite">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'waiting';
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full',
                  state === 'done' && 'bg-emerald-100 text-emerald-700',
                  state === 'active' && 'bg-blue-100 text-blue-700',
                  state === 'waiting' && 'bg-slate-100 text-slate-400',
                )}
              >
                {state === 'done' ? <IconCheck size={14} /> : state === 'active' ? <IconSpinner size={14} /> : <span className="text-xs">{i + 1}</span>}
              </span>
              <span className={cn(state === 'waiting' ? 'text-slate-400' : 'text-slate-800', state === 'active' && 'font-medium')}>
                {label}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <Button className="mt-6" variant="ghost" onClick={onCancel}>
        <IconX size={14} /> Cancel
      </Button>
    </Card>
  );
}
