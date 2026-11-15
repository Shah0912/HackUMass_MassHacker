// Owner picker with "Add person…", and a small team editor. Used on review and dashboard so a
// person the AI missed can be added and assigned after extraction.
import { useId, useState, type FormEvent } from 'react';
import { LIMITS, type Member } from '@/core/types';
import { Button, Dot, cn } from '@/components/ui';
import { IconPlus, IconTrash, IconX } from '@/components/icons';

const ADD = '__add__';
const inputBase = 'rounded-md bg-white px-2 py-1 text-sm ring-1 ring-slate-300 focus:outline-2 focus:outline-blue-600';

/**
 * Owner select. Picking "Add person…" swaps in a name field; Enter adds the person and assigns
 * them, Esc cancels. `onAddMember` returns the new (or existing same-name) member id.
 */
export function OwnerSelect({
  value,
  members,
  onChange,
  onAddMember,
  label,
  className,
}: {
  value: string | null;
  members: Member[];
  onChange: (ownerId: string | null) => void;
  onAddMember: (name: string) => string | null;
  label: string;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const full = members.length >= LIMITS.maxMembers;

  const submit = () => {
    const id = name.trim() ? onAddMember(name) : null;
    if (id) onChange(id);
    setAdding(false);
    setName('');
  };

  if (adding) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setAdding(false);
              setName('');
            }
          }}
          placeholder="New person's name"
          aria-label={`New person for ${label}`}
          maxLength={60}
          className={cn(inputBase, 'min-w-0 flex-1')}
        />
        <Button size="sm" onClick={submit} disabled={!name.trim()} aria-label="Add person and assign">
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (setAdding(false), setName(''))} aria-label="Cancel adding person">
          <IconX size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Dot color={members.find((m) => m.id === value)?.color ?? '#cbd5e1'} />
      <select
        value={value ?? ''}
        onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value || null))}
        aria-label={label}
        className={cn(inputBase, 'w-full')}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
        {!full && <option value={ADD}>+ Add person…</option>}
      </select>
    </div>
  );
}

/** Form to add one person with their hours per day. */
export function AddPersonForm({ onAdd, disabled, compact }: { onAdd: (name: string, hoursPerDay: number) => void; disabled?: boolean; compact?: boolean }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState(4);
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name, hours);
    setName('');
    setHours(4);
  };
  return (
    <form onSubmit={submit} className={cn('flex flex-wrap items-end gap-2', compact && 'text-sm')}>
      <label className="flex min-w-36 flex-1 flex-col gap-0.5" htmlFor={`${id}-name`}>
        <span className="text-xs font-medium text-slate-500">Name</span>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Jordan" disabled={disabled} className={inputBase} />
      </label>
      <label className="flex w-24 flex-col gap-0.5" htmlFor={`${id}-hours`}>
        <span className="text-xs font-medium text-slate-500">Hours/day</span>
        <input id={`${id}-hours`} type="number" min={0} max={24} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={disabled} className={inputBase} />
      </label>
      <Button type="submit" size="sm" disabled={disabled || !name.trim()}>
        <IconPlus size={14} /> Add person
      </Button>
    </form>
  );
}

/** Editable list of people: name, hours/day, remove (with a count of tasks that become unassigned). */
export function TeamEditor({
  members,
  taskCounts,
  onUpdate,
  onRemove,
  onAdd,
}: {
  members: Member[];
  taskCounts: Record<string, number>;
  onUpdate: (id: string, patch: { name?: string; hoursPerDay?: number }) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string, hoursPerDay: number) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const full = members.length >= LIMITS.maxMembers;
  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-slate-600">No people yet. The notes didn't name anyone who took on work; add your team below.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => {
            const n = taskCounts[m.id] ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
                <Dot color={m.color} />
                <input
                  value={m.name}
                  onChange={(e) => onUpdate(m.id, { name: e.target.value })}
                  aria-label={`Name of ${m.name || 'person'}`}
                  maxLength={60}
                  className={cn(inputBase, 'w-28')}
                />
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={m.hoursPerDay}
                  onChange={(e) => onUpdate(m.id, { hoursPerDay: Number(e.target.value) })}
                  aria-label={`Hours per day for ${m.name}`}
                  className={cn(inputBase, 'w-16')}
                />
                <span className="text-xs text-slate-500">h/day · {n} task{n === 1 ? '' : 's'}</span>
                {confirm === m.id ? (
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="danger" onClick={() => (onRemove(m.id), setConfirm(null))}>
                      Remove{n > 0 ? ` (unassigns ${n})` : ''}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(m.id)} aria-label={`Remove ${m.name}`}>
                    <IconTrash size={14} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {full ? <p className="text-xs text-slate-500">Team is full ({LIMITS.maxMembers} people).</p> : <AddPersonForm onAdd={onAdd} />}
    </div>
  );
}
