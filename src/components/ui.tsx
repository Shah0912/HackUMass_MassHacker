import { useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Confidence, Task, TaskStatus, Verdict } from '@/core/types';
import { fmtH } from '@/engine';
import { IconAlert, IconCheck, IconCheckCircle, IconClock, IconX } from './icons';

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

// ---------------- Buttons ----------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed',
        size === 'sm' && 'h-8 px-2.5 text-sm',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

// ---------------- Verdict ----------------

export const VERDICT_STYLE: Record<Verdict, { label: string; cls: string; Icon: typeof IconAlert }> = {
  late: { label: 'Late', cls: 'bg-red-50 text-red-800 ring-red-300', Icon: IconAlert },
  at_risk: { label: 'At risk', cls: 'bg-amber-50 text-amber-900 ring-amber-300', Icon: IconClock },
  on_track: { label: 'On track', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300', Icon: IconCheckCircle },
};

export function VerdictChip({ verdict, bufferHours, size = 'md' }: { verdict: Verdict; bufferHours?: number; size?: 'sm' | 'md' | 'lg' }) {
  const v = VERDICT_STYLE[verdict];
  const text =
    bufferHours === undefined
      ? v.label
      : verdict === 'late'
        ? `Late by ${fmtH(bufferHours)}`
        : verdict === 'at_risk'
          ? `At risk: ${fmtH(bufferHours)} spare`
          : `On track: ${fmtH(bufferHours)} spare`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 whitespace-nowrap',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-sm',
        size === 'lg' && 'px-4 py-1.5 text-lg',
        v.cls,
      )}
    >
      <v.Icon size={size === 'lg' ? 20 : size === 'sm' ? 12 : 16} />
      {text}
    </span>
  );
}

// ---------------- Status & confidence ----------------

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};
export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#64748b',
  in_progress: '#2563eb',
  blocked: '#dc2626',
  done: '#059669',
};
const STATUS_GLYPH: Record<TaskStatus, string> = { todo: '○', in_progress: '◐', blocked: '⊘', done: '●' };

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: STATUS_COLOR[status] }}>
      <span aria-hidden>{STATUS_GLYPH[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ConfidenceBadge({ task }: { task: Task }) {
  if (task.source === 'user') return <span className="text-xs text-slate-500">Edited</span>;
  const c: Confidence = task.confidence ?? 'high';
  if (c === 'low')
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
        <IconAlert size={12} /> Low, check this
      </span>
    );
  if (c === 'medium') return <span className="text-xs text-slate-600">Medium</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <IconCheck size={12} /> High
    </span>
  );
}

// ---------------- Misc ----------------

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-white ring-1 ring-slate-200', className)}>{children}</div>;
}

export function LoadBar({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.min(ratio, 1.5) / 1.5;
  const over = ratio > 1;
  const warn = ratio > 0.8;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={label}>
      <div
        className={cn('h-full rounded-full', over ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500')}
        style={{ width: `${pct * 100}%` }}
      />
      {/* 100% capacity marker */}
      <div className="absolute inset-y-0 w-0.5 bg-slate-500" style={{ left: `${(1 / 1.5) * 100}%` }} />
    </div>
  );
}

/** Updates every minute so deadline maths stays current without re-rendering constantly. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ---------------- Dependency picker ----------------

export function DependencyPicker({
  taskId,
  value,
  options,
  onChange,
  compact,
}: {
  taskId: string;
  value: string[];
  options: { id: string; title: string }[];
  onChange: (deps: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const choices = useMemo(
    () => options.filter((o) => o.id !== taskId && (!q || o.title.toLowerCase().includes(q.toLowerCase()))),
    [options, taskId, q],
  );
  const titleOf = (id: string) => options.find((o) => o.id === id)?.title || id;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), setOpen(false))}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full flex-wrap items-center gap-1 rounded-md bg-white px-2 py-1 text-left text-sm ring-1 ring-slate-300 hover:ring-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600',
          compact ? 'min-h-8' : 'min-h-9',
        )}
      >
        {value.length === 0 ? (
          <span className="text-slate-400">None</span>
        ) : (
          value.map((d) => (
            <span key={d} className="max-w-40 truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {titleOf(d)}
            </span>
          ))
        )}
      </button>
      {open && (
        <div id={listId} className="absolute z-30 mt-1 w-72 rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-200">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="mb-2 w-full rounded-md px-2 py-1 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600"
          />
          <fieldset className="max-h-60 overflow-y-auto">
            <legend className="sr-only">Must finish before this task</legend>
            {choices.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">No matching tasks</p>}
            {choices.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={value.includes(o.id)}
                  onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))}
                />
                <span className="truncate">{o.title || <em className="text-slate-400">Untitled</em>}</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-1 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              <IconX size={14} /> Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children && <div className="text-sm text-slate-600">{children}</div>}
      {action}
    </div>
  );
}
