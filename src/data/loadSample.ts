import type { Project } from '@/core/types';
import sampleProject from '../../fixtures/sample-project.json';

/** Fixture was authored relative to this instant (see sample.gold.test). */
const SAMPLE_ANCHOR_MS = new Date('2026-11-14T12:00:00-05:00').getTime();

/** Load the demo project and shift its deadline so lateness stays stable. */
export function loadSampleProject(now: Date = new Date()): Project {
  const base = sampleProject as Project;
  const offsetMs = new Date(base.deadline).getTime() - SAMPLE_ANCHOR_MS;
  const iso = now.toISOString();
  return {
    ...base,
    id: crypto.randomUUID(),
    deadline: new Date(now.getTime() + offsetMs).toISOString(),
    createdAt: iso,
    updatedAt: iso,
  };
}
