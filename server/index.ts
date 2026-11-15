// Production API server for self-hosting (e.g. a Vultr VPS behind nginx).
// nginx serves the static build in dist/ and proxies /api/* here.
// Handlers are the same web Request → Response functions Vercel runs; this file only adapts node:http to them.
// Keys come from process.env (load them with `--env-file=.env`); they are never sent to the browser.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as extract from '../api/extract';
import * as health from '../api/health';
import * as projects from '../api/projects';
import * as rescue from '../api/rescue';

type Handler = (req: Request) => Response | Promise<Response>;
type Module = Partial<Record<string, unknown>>;

const ROUTES: Record<string, Module> = { extract, health, projects, rescue };

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function errorBody(code: string, message: string, retryable: boolean) {
  return { ok: false, error: { code, message, retryable } };
}

function headersFrom(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = /^\/api\/([a-z0-9-]+)\/?$/i.exec(url.pathname);
  const mod = match ? ROUTES[match[1]!.toLowerCase()] : undefined;
  if (!mod) return sendJson(res, 404, errorBody('NOT_FOUND', 'No such endpoint.', false));

  const method = (req.method ?? 'GET').toUpperCase();
  const handler = (mod[method] ?? mod.default) as Handler | undefined;
  if (typeof handler !== 'function') return sendJson(res, 405, errorBody('METHOD_NOT_ALLOWED', 'Method not allowed.', false));

  try {
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
    const request = new Request(url, { method, headers: headersFrom(req), body: body && new Uint8Array(body) });
    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return sendJson(res, 413, errorBody('INPUT_TOO_LONG', 'The request is too large. Shorten the text and try again.', false));
    }
    // Log the error type only, never request content.
    console.error(JSON.stringify({ endpoint: url.pathname, error: 'UNEXPECTED', name: err instanceof Error ? err.name : typeof err }));
    if (!res.headersSent) sendJson(res, 500, errorBody('UPSTREAM_ERROR', 'The server had a problem. Try again.', true));
    else res.end();
  }
});

server.requestTimeout = 180_000;
server.listen(PORT, HOST, () => {
  console.log(`ClearPath API listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
