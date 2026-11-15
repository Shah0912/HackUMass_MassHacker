// /api/projects — saved projects in MongoDB, scoped to an anonymous workspace.
//   GET              → Project[] for the workspace
//   PUT  body=Project → upsert (ignored if the stored copy is newer)
//   DELETE ?id=<id>  → remove one project
// The workspace id is a random UUID the browser generates and sends in a header; knowing it is
// what grants access, so it is treated like a secret and never logged.
import { MongoServerError } from 'mongodb';
import { ProjectSchema } from '../src/core/schema';
import type { Project } from '../src/core/types';
import { docId, projectsCollection, StorageNotConfigured } from './_lib/db';
import { readJson } from './_lib/http';

export const WORKSPACE_HEADER = 'x-clearpath-workspace';
const WORKSPACE_RE = /^[A-Za-z0-9-]{16,64}$/;
const MAX_PROJECTS = 500;

type StorageErrorCode = 'STORAGE_NOT_CONFIGURED' | 'WORKSPACE_INVALID' | 'INPUT_INVALID' | 'STORAGE_ERROR';
const STATUS: Record<StorageErrorCode, number> = { STORAGE_NOT_CONFIGURED: 503, WORKSPACE_INVALID: 400, INPUT_INVALID: 400, STORAGE_ERROR: 502 };

const ok = <T>(data: T) => Response.json({ ok: true, data });
const fail = (code: StorageErrorCode, message: string, retryable: boolean) =>
  Response.json({ ok: false, error: { code, message, retryable } }, { status: STATUS[code] });

function workspaceOf(req: Request): string | null {
  const ws = req.headers.get(WORKSPACE_HEADER);
  return ws && WORKSPACE_RE.test(ws) ? ws : null;
}

function failFromError(err: unknown, method: string): Response {
  if (err instanceof StorageNotConfigured) return fail('STORAGE_NOT_CONFIGURED', 'Saving to the cloud is not set up on this server.', false);
  console.error(JSON.stringify({ endpoint: 'projects', method, error: err instanceof Error ? err.name : typeof err }));
  return fail('STORAGE_ERROR', "Couldn't reach the database. Your work is still saved in this browser.", true);
}

export async function GET(req: Request): Promise<Response> {
  const ws = workspaceOf(req);
  if (!ws) return fail('WORKSPACE_INVALID', 'Missing or invalid workspace id.', false);
  try {
    const col = await projectsCollection();
    const docs = await col.find({ workspaceId: ws }, { projection: { project: 1 } }).limit(MAX_PROJECTS).toArray();
    return ok(docs.map((d) => d.project));
  } catch (err) {
    return failFromError(err, 'GET');
  }
}

export async function PUT(req: Request): Promise<Response> {
  const ws = workspaceOf(req);
  if (!ws) return fail('WORKSPACE_INVALID', 'Missing or invalid workspace id.', false);
  const parsed = ProjectSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('INPUT_INVALID', `The project was not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}.`, false);
  const project = parsed.data as Project;
  try {
    const col = await projectsCollection();
    // Only overwrite an older (or equal) copy; a stale tab must not clobber newer work.
    await col.replaceOne(
      { _id: docId(ws, project.id), 'project.updatedAt': { $lte: project.updatedAt } },
      { workspaceId: ws, project, savedAt: new Date() },
      { upsert: true },
    );
    return ok({ saved: true });
  } catch (err) {
    // Filter missed because the stored copy is newer, so the upsert hit the existing _id.
    if (err instanceof MongoServerError && err.code === 11000) return ok({ saved: false, reason: 'stale' });
    return failFromError(err, 'PUT');
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const ws = workspaceOf(req);
  if (!ws) return fail('WORKSPACE_INVALID', 'Missing or invalid workspace id.', false);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('INPUT_INVALID', 'Missing project id.', false);
  try {
    const col = await projectsCollection();
    await col.deleteOne({ _id: docId(ws, id) });
    return ok({ deleted: true });
  } catch (err) {
    return failFromError(err, 'DELETE');
  }
}
