import { describe, expect, it } from 'vitest';
import type { Project } from '@/core/types';
import { diffProjects, mergeProjects } from './sync';

const proj = (id: string, updatedAt: string, name = id): Project => ({
  schemaVersion: 1,
  id,
  name,
  deadline: '2026-12-01T18:00:00.000Z',
  workHoursPerDay: 6,
  members: [],
  tasks: [],
  rawInput: '',
  openQuestions: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt,
});

const T1 = '2026-11-10T00:00:00.000Z';
const T2 = '2026-11-11T00:00:00.000Z';

describe('mergeProjects', () => {
  it('adds server-only projects', () => {
    const r = mergeProjects({}, [proj('a', T1)], new Set());
    expect(Object.keys(r.projects)).toEqual(['a']);
    expect(r.toPush).toEqual([]);
  });

  it('takes the newer server copy', () => {
    const r = mergeProjects({ a: proj('a', T1, 'old') }, [proj('a', T2, 'new')], new Set(['a']));
    expect(r.projects.a!.name).toBe('new');
    expect(r.toPush).toEqual([]);
  });

  it('keeps and pushes a newer local copy', () => {
    const r = mergeProjects({ a: proj('a', T2, 'local') }, [proj('a', T1, 'server')], new Set(['a']));
    expect(r.projects.a!.name).toBe('local');
    expect(r.toPush).toEqual(['a']);
  });

  it('keeps the local copy on a tie without pushing', () => {
    const local = proj('a', T1, 'local');
    const r = mergeProjects({ a: local }, [proj('a', T1, 'server')], new Set(['a']));
    expect(r.projects.a).toBe(local);
    expect(r.toPush).toEqual([]);
  });

  it('pushes local projects never synced before', () => {
    const r = mergeProjects({ a: proj('a', T1) }, [], new Set());
    expect(r.projects.a).toBeDefined();
    expect(r.toPush).toEqual(['a']);
    expect(r.removedRemotely).toEqual([]);
  });

  it('drops local projects that were synced and are gone from the server', () => {
    const r = mergeProjects({ a: proj('a', T1) }, [], new Set(['a']));
    expect(r.projects.a).toBeUndefined();
    expect(r.removedRemotely).toEqual(['a']);
    expect(r.toPush).toEqual([]);
  });

  it('does not mutate the local map', () => {
    const local = { a: proj('a', T1) };
    mergeProjects(local, [], new Set(['a']));
    expect(local.a).toBeDefined();
  });
});

describe('diffProjects', () => {
  it('reports changed, added and removed ids by reference', () => {
    const a = proj('a', T1);
    const b = proj('b', T1);
    const prev = { a, b };
    const next = { a, b: { ...b, name: 'x' }, c: proj('c', T1) };
    expect(diffProjects(prev, next)).toEqual({ changed: ['b', 'c'], removed: [] });
    expect(diffProjects(next, { a })).toEqual({ changed: [], removed: ['b', 'c'] });
  });

  it('reports nothing for the same map', () => {
    const m = { a: proj('a', T1) };
    expect(diffProjects(m, m)).toEqual({ changed: [], removed: [] });
  });
});
