import { create } from 'zustand';
import type { Project } from '@/core/types';

type ProjectState = {
  project: Project | null;
  setProject: (project: Project) => void;
  reset: () => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  setProject: (project) => set({ project }),
  reset: () => set({ project: null }),
}));
