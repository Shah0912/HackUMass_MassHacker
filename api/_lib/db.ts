// MongoDB access for saved projects. Server-only: the URI comes from env and never reaches src/.
// One client per process, reused across requests (and across warm serverless invocations).
import { MongoClient, type Collection } from 'mongodb';
import type { Project } from '../../src/core/types';

export interface ProjectDoc {
  _id: string; // `${workspaceId}:${project.id}` so one workspace can never overwrite another's project
  workspaceId: string;
  project: Project; // raw project only; analysis is derived and never stored
  savedAt: Date;
}

export class StorageNotConfigured extends Error {}

let clientPromise: Promise<MongoClient> | null = null;
let indexReady: Promise<unknown> | null = null;

export function storageConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function projectsCollection(): Promise<Collection<ProjectDoc>> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new StorageNotConfigured('MONGODB_URI is not set');
  clientPromise ??= new MongoClient(uri, { appName: 'clearpath', serverSelectionTimeoutMS: 8000 }).connect().catch((err) => {
    clientPromise = null; // let the next request retry instead of caching the failure
    throw err;
  });
  const client = await clientPromise;
  const col = client.db(process.env.MONGODB_DB || 'clearpath').collection<ProjectDoc>('projects');
  indexReady ??= col.createIndex({ workspaceId: 1 }).catch(() => {
    indexReady = null;
  });
  await indexReady;
  return col;
}

export const docId = (workspaceId: string, projectId: string) => `${workspaceId}:${projectId}`;
