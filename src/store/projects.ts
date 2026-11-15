// App state: saved projects, the intake draft and the what-if draft, persisted to localStorage.
// Analysis is never stored; components derive it with analyse().
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Project } from '@/core/types';
import { ProjectSchema } from '@/core/schema';
import { buildSampleProject } from '@/mocks/sampleProject';

export interface IntakeDraft {
  name: string;
  text: string;
  deadline: string; // <input type="datetime-local"> value
  workHoursPerDay: number;
  members: { name: string; hoursPerDay: number }[];
  detectMembers: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyDraft(): IntakeDraft {
  const d = new Date(Date.now() + 2 * 24 * 3_600_000);
  d.setHours(18, 0, 0, 0);
  return { name: '', text: '', deadline: toLocalInput(d), workHoursPerDay: 6, members: [{ name: '', hoursPerDay: 4 }], detectMembers: true };
}

export interface WhatIf {
  projectId: string;
  draft: Project;
}

interface State {
  projects: Record<string, Project>;
  intakeDraft: IntakeDraft;
  whatIf: WhatIf | null;

  setIntakeDraft: (patch: Partial<IntakeDraft>) => void;
  resetIntakeDraft: () => void;
  saveProject: (p: Project) => string;
  updateProject: (id: string, fn: (p: Project) => Project) => void;
  deleteProject: (id: string) => void;
  loadSample: () => string;
  importProject: (json: string) => { ok: true; id: string } | { ok: false; message: string };

  startWhatIf: (id: string, fn?: (p: Project) => Project) => void;
  updateWhatIf: (fn: (p: Project) => Project) => void;
  applyWhatIf: () => void;
  discardWhatIf: () => void;
}

// Every storage access wrapped so the app still renders if storage is blocked or full.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: keep working in memory */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projects: {},
      intakeDraft: emptyDraft(),
      whatIf: null,

      setIntakeDraft: (patch) => set((s) => ({ intakeDraft: { ...s.intakeDraft, ...patch } })),
      resetIntakeDraft: () => set({ intakeDraft: emptyDraft() }),

      saveProject: (p) => {
        set((s) => ({ projects: { ...s.projects, [p.id]: p } }));
        return p.id;
      },
      updateProject: (id, fn) =>
        set((s) => {
          const p = s.projects[id];
          return p ? { projects: { ...s.projects, [id]: fn(p) } } : {};
        }),
      deleteProject: (id) =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.projects;
          return { projects: rest, whatIf: s.whatIf?.projectId === id ? null : s.whatIf };
        }),
      // Always a new project: never overwrites a saved one (F-09).
      loadSample: () => get().saveProject(buildSampleProject()),

      importProject: (json) => {
        let raw: unknown;
        try {
          raw = JSON.parse(json);
        } catch {
          return { ok: false, message: "That file isn't valid JSON." };
        }
        const parsed = ProjectSchema.safeParse(raw);
        if (!parsed.success) return { ok: false, message: "That file isn't a Linchpin project, so nothing was imported." };
        const now = new Date().toISOString();
        const p: Project = { ...parsed.data, id: crypto.randomUUID(), updatedAt: now };
        return { ok: true, id: get().saveProject(p) };
      },

      startWhatIf: (id, fn) => {
        const p = get().projects[id];
        if (!p) return;
        const current = get().whatIf;
        const base = current?.projectId === id ? current.draft : structuredClone(p);
        set({ whatIf: { projectId: id, draft: fn ? fn(base) : base } });
      },
      updateWhatIf: (fn) => set((s) => (s.whatIf ? { whatIf: { ...s.whatIf, draft: fn(s.whatIf.draft) } } : {})),
      applyWhatIf: () => {
        const w = get().whatIf;
        if (!w) return;
        set((s) => ({ projects: { ...s.projects, [w.projectId]: { ...w.draft, updatedAt: new Date().toISOString() } }, whatIf: null }));
      },
      discardWhatIf: () => set({ whatIf: null }),
    }),
    {
      name: 'linchpin:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ projects: s.projects, intakeDraft: s.intakeDraft, whatIf: s.whatIf }),
    },
  ),
);

export function downloadProject(p: Project) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.linchpin.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
