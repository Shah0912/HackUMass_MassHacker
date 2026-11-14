import type { ExtractInput, ExtractModelOutput } from '@/ai/contracts';
import type { Member, Project, Task } from '@/core/types';

const MEMBER_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#db2777',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#be123c',
  '#0f766e',
  '#a16207',
  '#334155',
];

export function clampEstimate(hours: number): number {
  const clamped = Math.min(80, Math.max(0.25, hours));
  return Math.round(clamped * 4) / 4;
}

export function namesMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = na.split(/\s+/)[0]!;
  const fb = nb.split(/\s+/)[0]!;
  return fa === fb;
}

function matchOwnerId(ownerName: string | null, members: Member[]): string | null {
  if (!ownerName) return null;
  const hit = members.find((m) => namesMatch(m.name, ownerName));
  return hit?.id ?? null;
}

/** Map model extract output into a stored Project. */
export function modelOutputToProject(
  output: ExtractModelOutput,
  input: ExtractInput,
  now: Date = new Date(),
): Project {
  const members: Member[] = input.members.map((m, i) => ({
    id: `m${i + 1}`,
    name: m.name,
    hoursPerDay: m.hoursPerDay,
    color: MEMBER_COLORS[i % MEMBER_COLORS.length]!,
  }));

  const keyToId = new Map<string, string>();
  output.tasks.forEach((t, i) => {
    keyToId.set(t.key, `t${i + 1}`);
  });

  const tasks: Task[] = output.tasks.map((t, i) => {
    const id = `t${i + 1}`;
    const dependsOn = t.dependsOnKeys
      .map((k) => keyToId.get(k))
      .filter((depId): depId is string => !!depId && depId !== id);

    return {
      id,
      title: t.title.trim().slice(0, 80) || `Task ${id}`,
      ownerId: matchOwnerId(t.ownerName, members),
      estimateHours: clampEstimate(t.estimateHours),
      status: t.status,
      dependsOn,
      source: 'ai',
      confidence: t.confidence,
      estimateInferred: t.estimateInferred,
      evidence: t.evidence.slice(0, 160),
    };
  });

  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: (output.projectName?.trim() || 'Untitled project').slice(0, 80),
    deadline: input.deadline,
    workHoursPerDay: input.workHoursPerDay,
    members,
    tasks,
    rawInput: input.text,
    openQuestions: [],
    createdAt: iso,
    updatedAt: iso,
  };
}
