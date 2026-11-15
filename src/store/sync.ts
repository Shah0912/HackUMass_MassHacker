// Pure helpers for syncing the local project map with the server copy. No network, no storage.
import type { Project } from '@/core/types';

export interface MergeResult {
  projects: Record<string, Project>;
  /** Local copies the server lacks or has an older version of. */
  toPush: string[];
  /** Ids that were synced before but are gone from the server (deleted on another device). */
  removedRemotely: string[];
}

/**
 * Merge server projects into local ones. Newer `updatedAt` wins; on a tie the local copy stays.
 * A local project the server lacks is pushed, unless it was synced before (then it was deleted
 * elsewhere and is dropped locally).
 */
export function mergeProjects(local: Record<string, Project>, remote: Project[], previouslySynced: ReadonlySet<string>): MergeResult {
  const projects: Record<string, Project> = { ...local };
  const toPush: string[] = [];
  const removedRemotely: string[] = [];
  const remoteIds = new Set<string>();

  for (const r of remote) {
    remoteIds.add(r.id);
    const l = local[r.id];
    if (!l || r.updatedAt > l.updatedAt) projects[r.id] = r;
    else if (l.updatedAt > r.updatedAt) toPush.push(r.id);
  }
  for (const id of Object.keys(local)) {
    if (remoteIds.has(id)) continue;
    if (previouslySynced.has(id)) {
      delete projects[id];
      removedRemotely.push(id);
    } else {
      toPush.push(id);
    }
  }
  return { projects, toPush, removedRemotely };
}

/** What changed between two project maps, by reference (store updates replace changed projects). */
export function diffProjects(prev: Record<string, Project>, next: Record<string, Project>): { changed: string[]; removed: string[] } {
  const changed = Object.keys(next).filter((id) => next[id] !== prev[id]);
  const removed = Object.keys(prev).filter((id) => !(id in next));
  return { changed, removed };
}
