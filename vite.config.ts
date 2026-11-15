/// <reference types="vitest/config" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev only: serve api/<name>.ts at /api/<name> from `npm run dev`, so the full flow works
 * without `vercel dev`. Handlers export POST/GET (web Request → Response) or a default.
 * Server-only env (GEMINI_API_KEY etc.) is loaded into process.env here, never into the bundle.
 */
function localApi(): Plugin {
  return {
    name: 'clearpath-local-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, { ...loadEnv(server.config.mode, process.cwd(), ''), ...process.env });
      // Database settings live in their own file (MONGODB_URI etc.); server-only, like the AI keys.
      if (existsSync('.env.mongo')) process.loadEnvFile('.env.mongo');
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/([a-z0-9-]+)\/?(?:\?.*)?$/i.exec(req.url ?? '');
        const file = match && fileURLToPath(new URL(`./api/${match[1]}.ts`, import.meta.url));
        if (!file || !existsSync(file)) return next();
        try {
          const mod = await server.ssrLoadModule(file);
          const method = (req.method ?? 'GET').toUpperCase();
          const handler = mod[method] ?? mod.default;
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method,
            headers: req.headers as Record<string, string>,
            body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: { code: 'UPSTREAM_ERROR', message: 'Local API crashed; see the terminal.', retryable: true } }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
  },
});
