// Mirrors saved projects to /api/projects (MongoDB) so they survive a cleared browser and can be
// opened on another device. localStorage stays the working copy, so the app still works offline,
// with VITE_MOCK_AI=1, or when the server has no database configured (sync just stays off).
// Only applied projects sync; the intake draft and the what-if draft stay local.
import type { Project } from '@/core/types';
import { useStore } from './projects';
import { diffProjects, mergeProjects } from './sync';
import { uuid } from './uuid';

const WORKSPACE_KEY = 'clearpath:workspace';
const WORKSPACE_HEADER = 'x-clearpath-workspace';
const WORKSPACE_RE = /^[A-Za-z0-9-]{16,64}$/;
const PUSH_DELAY_MS = 800;

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'error';
let status: SyncStatus = 'off';
const listeners = new Set<(s: SyncStatus) => void>();
function setStatus(s: SyncStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export const getSyncStatus = () => status;
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: sync still works for this session */
  }
}

/**
 * The anonymous workspace this browser saves into. Opening the app with `?workspace=<id>` joins
 * that workspace (e.g. on a second device); the id is then removed from the address bar.
 */
export function getWorkspaceId(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('workspace');
  if (fromUrl && WORKSPACE_RE.test(fromUrl)) {
    writeLocal(WORKSPACE_KEY, fromUrl);
    url.searchParams.delete('workspace');
    window.history.replaceState(window.history.state, '', url);
    return fromUrl;
  }
  const saved = readLocal(WORKSPACE_KEY);
  if (saved && WORKSPACE_RE.test(saved)) return saved;
  const fresh = uuid();
  writeLocal(WORKSPACE_KEY, fresh);
  return fresh;
}

const syncedKey = (ws: string) => `clearpath:synced:${ws}`;
function loadSynced(ws: string): Set<string> {
  try {
    const raw = JSON.parse(readLocal(syncedKey(ws)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; retryable: boolean } };

class SyncError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function call<T>(ws: string, method: string, query = '', body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(`/api/projects${query}`, {
    method,
    headers: { [WORKSPACE_HEADER]: ws, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive,
  });
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new SyncError(`HTTP_${res.status}`);
  }
  if (!json.ok) throw new SyncError(json.error.code);
  return json.data;
}

let started = false;

export function startRemoteSync(): void {
  if (started || import.meta.env.VITE_MOCK_AI === '1') return;
  started = true;
  const ws = getWorkspaceId();
  const synced = loadSynced(ws);
  const saveSynced = () => writeLocal(syncedKey(ws), JSON.stringify([...synced]));
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const push = async (id: string, keepalive = false) => {
    timers.delete(id);
    const p: Project | undefined = useStore.getState().projects[id];
    if (!p) return;
    try {
      await call(ws, 'PUT', '', p, keepalive);
      synced.add(id);
      saveSynced();
      setStatus('synced');
    } catch {
      // Left for the next load: the local copy is newer, so the merge pushes it then.
      setStatus('error');
    }
  };
  const schedule = (id: string) => {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => void push(id), PUSH_DELAY_MS));
  };
  const remove = async (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    try {
      await call(ws, 'DELETE', `?id=${encodeURIComponent(id)}`);
      synced.delete(id);
      saveSynced();
    } catch {
      setStatus('error');
    }
  };

  setStatus('connecting');
  void (async () => {
    let remote: Project[];
    try {
      remote = await call<Project[]>(ws, 'GET');
    } catch (err) {
      // No database on this server (or no server at all): stay local-only.
      setStatus(err instanceof SyncError && err.code === 'STORAGE_NOT_CONFIGURED' ? 'off' : 'error');
      return;
    }

    const state = useStore.getState();
    const merged = mergeProjects(state.projects, remote, synced);
    remote.forEach((p) => synced.add(p.id));
    merged.removedRemotely.forEach((id) => synced.delete(id));
    saveSynced();
    useStore.setState({
      projects: merged.projects,
      whatIf: state.whatIf && merged.projects[state.whatIf.projectId] ? state.whatIf : null,
    });
    setStatus('synced');
    merged.toPush.forEach((id) => void push(id));

    // From here on, mirror every saved-project change.
    useStore.subscribe((next, prev) => {
      if (next.projects === prev.projects) return;
      const { changed, removed } = diffProjects(prev.projects, next.projects);
      changed.forEach(schedule);
      removed.forEach((id) => void remove(id));
    });

    // Flush edits still waiting on the debounce when the tab closes.
    window.addEventListener('pagehide', () => {
      for (const id of [...timers.keys()]) {
        clearTimeout(timers.get(id));
        void push(id, true);
      }
    });
  })();
}
