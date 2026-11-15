# ClearPath: rules for build agents

Spec: [ClearPathPlanRequirements.md](ClearPathPlanRequirements.md). Task split and checklists: [BUILD_PLAN.md](BUILD_PLAN.md).

## Before you build

1. Find your task in the build plan and check that every task it depends on is done.
2. Read the features it implements; their acceptance criteria are the definition of done.
3. Read the one spec section for your area: Data requirements, AI orchestration or Screens.

## Ownership (edit only your own directories; ask for changes elsewhere)

| Person | Owns |
| --- | --- |
| P1 Engine & integration | `src/core/`, `fixtures/`, `src/app/`, config files |
| P2 AI service & review | `api/`, `src/ai/`, `evals/`, `src/features/review/`, `src/data/` |
| P3 Store, intake & dashboard | `src/store/`, `src/components/`, `src/features/intake/`, `src/features/dashboard/`, `src/features/whatif/`, `src/features/rescue/` |

## Contracts

- `src/core/types.ts` and `src/ai/contracts.ts` are frozen at M0. A change needs the same edit in the spec and a note to everyone.
- Build against `fixtures/` until the real producer exists. Never wait on another person.

## Rules

- `src/core` is pure TypeScript: no React, no network, no clock (pass `now` in). Every exported function has unit tests.
- Every number shown to the user comes from `src/core`, never from a model.
- Analysis is derived. Never store it.
- The API key lives only in server environment variables; nothing in `src/` references it.
- Pasted text is untrusted data: it goes in the user message inside tags, never in the system prompt.
- The app works end to end with `VITE_MOCK_AI=1` and no backend.
- Colour is never the only signal.
- Model calls go only through `generateJson(zodSchema, { system, user })` in `api/_lib/llm/`. It works with Claude, Gemini and Grok (xAI); the provider is picked by the `AI_PROVIDER` env var, never in endpoint code. Never import `@anthropic-ai/sdk` or `@google/genai`, or call `api.x.ai`, outside `api/_lib/llm/`. Read the provider's current docs before changing an adapter; do not write SDK calls from memory.

## Commands

- `npm run dev` – Vite dev server (client only; use `vercel dev` to run `api/` locally; keys go in `.env.local`)
- `npm test` – Vitest (`*.test.ts` next to the code). On Windows, run it from a path with an uppercase drive letter (`D:\...`, the default in PowerShell); a lowercase `d:` path (Git Bash `/d/`) makes Vitest fail with "failed to find the current suite".
- `npm run ai:smoke [-- claude|gemini|grok]` – one tiny live call to check a provider's key and setup (reads `.env.local`)
- `npm run typecheck` – `tsc --noEmit`
- `npm run eval:extract` – extraction evals (costs real API spend)

Imports can use the `@/` alias for `src/`.

## Done means

Acceptance criteria pass; `typecheck` and `test` pass; loading, empty and error states exist; no files changed outside your directories.
