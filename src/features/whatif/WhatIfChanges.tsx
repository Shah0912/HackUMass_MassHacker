// S7 What-if: list of changes against the saved project, each with its own undo.
import type { Project, Task } from '@/core/types';
import { fmtH } from '@/engine';
import { STATUS_LABEL } from '@/components/ui';
import { IconUndo } from '@/components/icons';

export interface Change {
  key: string;
  taskId: string;
  text: string;
  revert: (draft: Project) => Project;
}

const FIELDS: (keyof Task)[] = ['ownerId', 'estimateHours', 'status', 'cut', 'dependsOn', 'title'];

export function diffProjects(base: Project, draft: Project): Change[] {
  const name = (id: string | null | undefined) => base.members.find((m) => m.id === id)?.name ?? 'Unassigned';
  const baseById = new Map(base.tasks.map((t) => [t.id, t]));
  const changes: Change[] = [];
  for (const t of draft.tasks) {
    const b = baseById.get(t.id);
    if (!b) {
      changes.push({ key: `${t.id}:add`, taskId: t.id, text: `Added "${t.title || 'Untitled'}"`, revert: (d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== t.id) }) });
      continue;
    }
    for (const f of FIELDS) {
      const was = b[f];
      const now = t[f];
      if (JSON.stringify(was ?? null) === JSON.stringify(now ?? null) && !(f === 'cut' && !!was !== !!now)) continue;
      if (f === 'cut' && !!was === !!now) continue;
      const title = `"${b.title}"`;
      const text =
        f === 'ownerId'
          ? `${title}: ${name(was as string | null)} → ${name(now as string | null)}`
          : f === 'estimateHours'
            ? `${title}: ${fmtH(was as number)} → ${fmtH(now as number)}`
            : f === 'status'
              ? `${title}: ${STATUS_LABEL[was as Task['status']]} → ${STATUS_LABEL[now as Task['status']]}`
              : f === 'cut'
                ? now
                  ? `Cut ${title}`
                  : `Restored ${title}`
                : f === 'dependsOn'
                  ? `${title}: changed what it waits on`
                  : `Renamed ${title}`;
      changes.push({
        key: `${t.id}:${f}`,
        taskId: t.id,
        text,
        revert: (d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, [f]: was } : x)) }),
      });
    }
  }
  return changes;
}

export function WhatIfChanges({ changes, onUndo, onSelect }: { changes: Change[]; onUndo: (c: Change) => void; onSelect: (taskId: string) => void }) {
  if (changes.length === 0) {
    return <p className="text-sm text-amber-900">No changes yet. Click a task to reassign, re-estimate, mark done or cut it. Nothing is saved until you apply.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What-if changes">
      {changes.map((c) => (
        <li key={c.key} className="flex items-center gap-1 rounded-full bg-white py-0.5 pl-2.5 pr-1 text-sm ring-1 ring-amber-300">
          <button type="button" className="max-w-80 truncate hover:underline" onClick={() => onSelect(c.taskId)}>
            {c.text}
          </button>
          <button type="button" onClick={() => onUndo(c)} aria-label={`Undo: ${c.text}`} className="rounded-full p-1 text-slate-600 hover:bg-amber-100">
            <IconUndo size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}
