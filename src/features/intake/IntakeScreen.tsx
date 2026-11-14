import { useState } from 'react';
import { ExtractHttpError, extractProject } from '@/ai/extract';
import sampleRaw from '@/data/sample-raw-input.txt?raw';
import { loadSampleProject } from '@/data/loadSample';
import { useProjectStore } from '@/store/projectStore';

const MAX_CHARS = 30_000;

type MemberDraft = { name: string; hoursPerDay: number };

const DEFAULT_MEMBERS: MemberDraft[] = [
  { name: 'Alex', hoursPerDay: 4 },
  { name: 'Jordan', hoursPerDay: 4 },
  { name: 'Sam', hoursPerDay: 3 },
  { name: 'Riley', hoursPerDay: 4 },
];

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setMinutes(0, 0, 0);
  // datetime-local wants local YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoDeadline(localValue: string): string {
  const d = new Date(localValue);
  return Number.isNaN(d.getTime()) ? localValue : d.toISOString();
}

export function IntakeScreen() {
  const setProject = useProjectStore((s) => s.setProject);
  const [text, setText] = useState('');
  const [deadlineLocal, setDeadlineLocal] = useState(defaultDeadline);
  const [members, setMembers] = useState<MemberDraft[]>(DEFAULT_MEMBERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  const tooLong = text.length > MAX_CHARS;
  const deadlineDate = new Date(deadlineLocal);
  const deadlineOk = !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() > Date.now();
  const canAnalyse = text.trim().length > 0 && !tooLong && deadlineOk && !loading;

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function addMember() {
    setMembers((prev) => [...prev, { name: '', hoursPerDay: 4 }]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  async function runExtract() {
    setLoading(true);
    setError(null);
    setRetryable(false);
    try {
      const project = await extractProject({
        text,
        deadline: toIsoDeadline(deadlineLocal),
        workHoursPerDay: 6,
        members: members.filter((m) => m.name.trim().length > 0),
      });
      setProject(project);
    } catch (e) {
      if (e instanceof ExtractHttpError) {
        setError(e.body.error.message);
        setRetryable(e.body.error.retryable);
      } else {
        setError(e instanceof Error ? e.message : 'Extraction failed.');
        setRetryable(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function trySample() {
    setError(null);
    setProject(loadSampleProject());
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase">Linchpin</p>
        <h1 className="font-display text-4xl leading-tight text-stone-900">
          Find the task your project is waiting on
        </h1>
        <p className="text-stone-600">
          Paste a messy group chat. Code finds the bottleneck and whether you finish on time.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="raw-text" className="text-sm font-medium text-stone-800">
            Project chat / notes
          </label>
          <button
            type="button"
            className="text-sm text-teal-800 underline-offset-2 hover:underline"
            onClick={() => setText(sampleRaw)}
          >
            Paste the sample chat
          </button>
        </div>
        <textarea
          id="raw-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-900 shadow-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
          placeholder="Paste Slack / Discord / notes here…"
          disabled={loading}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={tooLong ? 'font-medium text-red-700' : 'text-stone-500'}>
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            {tooLong ? ' — too long (text is kept; shorten to analyse)' : ''}
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="deadline" className="text-sm font-medium text-stone-800">
            Deadline
          </label>
          <input
            id="deadline"
            type="datetime-local"
            value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            disabled={loading}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
          />
          {!deadlineOk && (
            <p className="text-xs text-red-700">Pick a deadline in the future.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-stone-800">Work hours / day</p>
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            6 (team default for MVP)
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-800">Team</h2>
          <button
            type="button"
            onClick={addMember}
            disabled={loading}
            className="text-sm text-teal-800 underline-offset-2 hover:underline"
          >
            Add member
          </button>
        </div>
        <ul className="space-y-2">
          {members.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Member ${i + 1} name`}
                value={m.name}
                onChange={(e) => updateMember(i, { name: e.target.value })}
                placeholder="Name"
                disabled={loading}
                className="min-w-[10rem] flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              />
              <label className="flex items-center gap-1 text-sm text-stone-600">
                <span className="sr-only">Hours per day</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={m.hoursPerDay}
                  onChange={(e) =>
                    updateMember(i, { hoursPerDay: Number(e.target.value) || 1 })
                  }
                  disabled={loading}
                  className="w-20 rounded-md border border-stone-300 px-2 py-2 text-sm outline-none focus:border-teal-700"
                />
                h/day
              </label>
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  disabled={loading}
                  className="text-sm text-stone-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-medium">Couldn’t analyse</p>
          <p className="mt-1">{error}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {retryable && (
              <button
                type="button"
                onClick={() => void runExtract()}
                className="font-medium text-red-900 underline"
              >
                Try again
              </button>
            )}
            <button type="button" onClick={trySample} className="text-red-900 underline">
              Use sample instead
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div
          role="status"
          className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"
        >
          Extracting tasks from your text… (mock AI takes ~1.5s)
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAnalyse}
          onClick={() => void runExtract()}
          className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          Analyse
        </button>
        <button
          type="button"
          onClick={trySample}
          disabled={loading}
          className="rounded-md border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          Try the sample
        </button>
      </div>

      <p className="text-xs text-stone-500">
        Your text is sent to an AI service to extract tasks. It is not stored on a server. With mock
        mode on, nothing leaves your browser.
      </p>
    </main>
  );
}
