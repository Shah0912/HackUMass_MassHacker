# Linchpin MVP: 3-Hour Build

**Promise:** paste a messy project chat → see the one task everything waits on → know whether the team finishes on time.

This is the hackathon build plan for 3 people in parallel. [BUILD_PLAN.md](BUILD_PLAN.md) is the post-demo roadmap. Where this file and the spec disagree, this file wins for the MVP.

**Before the clock starts:** the repo runs (`npm run dev`, `npm run typecheck`), the Vercel project is linked and `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` (plus `AI_PROVIDER`) are set in Vercel's env settings and in your local `.env.local`; `npm run ai:smoke` passes. If any of that isn't true, do it first; it doesn't count against the 3 hours.

## The flow and the three interfaces

```
Intake ──> extractProject(input) ──> Project ──> analyse(project, now) ──> Analysis ──> Dashboard
                (P2)                                     (P1)                        (P3)
Try the sample ──> sample-project.json ─────┘
```

```ts
// P2: src/ai/extract.ts (calls /api/extract, or returns the fixture in mock mode)
extractProject(input: ExtractInput): Promise<Project>

// P1: src/core/analyse.ts (pure, no clock, no React)
analyse(project: Project, now: Date): Analysis

// P3: src/store/project.ts
setProject(project: Project): void
// The dashboard derives Analysis with analyse(); it is never stored or hand-calculated.
```

There is **one** source of truth for numbers: `Analysis`. The verdict bar, graph and risk list all read from it; no UI component computes anything itself.

## In vs. out

| In (MVP) | Out (after the demo) |
| --- | --- |
| Intake form + Try the sample | Review/edit table, validation banner |
| AI extraction (request/response, no streaming) + mock mode | Streaming, repair retry, evals, open questions |
| Critical path, slack, verdict | Fix suggestions, `bufferGainHours` |
| Bottleneck (one task, deterministic) + member load | What-if, rescue plan, update from messages |
| 3 risk rules with computed numbers | Saved-projects list, import/export |
| Graph with critical path and bottleneck marked | Graph filters, task drawer, routing |
| Zustand state (`persist` only if it's one line and works) | Polish and a11y pass beyond "not colour alone" |

**Never cut:** critical path, deadline verdict, bottleneck, graph, sample project. Those five are the demo.

---

## Frozen decisions

### Contracts (`src/core/types.ts`, owned by P1)

Use the spec's stored types (`Member`, `Task`, `Project`) unchanged: `dependsOn`, `estimateHours` in hours, `deadline` as an ISO 8601 string, `ownerId: string | null`. Drop from the MVP: `OpenQuestion` usage, `Risk.suggestion`, `cut`.

```ts
export interface Analysis {
  valid: boolean;                 // false → only `issues` is filled
  issues: ValidationIssue[];
  order: string[];                // topological order
  criticalPath: string[];
  durationHours: number;          // critical path length in remaining hours
  availableHours: number;
  bufferHours: number;            // available − duration
  verdict: 'late' | 'at_risk' | 'on_track';
  tasks: Record<string, TaskMetrics>;     // keyed by task ID
  members: Record<string, MemberMetrics>; // keyed by member ID
  bottleneckTaskId: string | null;        // MVP addition
  risks: Risk[];                          // computed inside analyse(), max 3
}
```

`TaskMetrics`, `MemberMetrics`, `Risk` and `ValidationIssue` are as in the spec.

### API envelope (`src/ai/contracts.ts`, owned by P2)

```ts
type ExtractInput = {
  text: string;                   // max 30,000 chars
  deadline: string;               // ISO 8601
  workHoursPerDay: number;        // default 6
  members: { name: string; hoursPerDay: number }[];
};
type ExtractResponse = { ok: true; data: Project };
type ApiError = { ok: false; error: { code: string; message: string; retryable: boolean } };
```

Error codes for the MVP: `INPUT_TOO_LONG`, `INPUT_INVALID`, `MODEL_REFUSED`, `MODEL_INVALID_OUTPUT`, `UPSTREAM_ERROR`, `TIMEOUT`.

### Scheduling rules

- Remaining hours: done = 0, in progress = 50% of the estimate, todo or blocked = 100%.
- Tasks run in parallel unless a dependency forces an order (no resource levelling).
- Topological sort with Kahn's algorithm; ties broken by task ID.
- Critical path uses remaining hours; walk-back ties go to the lowest ID.
- Available hours = max(0, days to deadline) × `workHoursPerDay`; days to deadline = (deadline − `now`) / 24 h. No weekends or holidays.
- Verdict: `late` if buffer < 0; `at_risk` if buffer < 15% of duration; else `on_track`.
- Member capacity = days to deadline × `hoursPerDay`; load ratio = remaining ÷ capacity (99 if capacity is 0).
- `now` is always passed in; `src/core` never reads the clock.

### Bottleneck rule

```
bottleneckTaskId = the unfinished task with the most distinct unfinished downstream tasks
tie-break 1: on the critical path beats not on it
tie-break 2: lowest task ID
null if no unfinished task has any downstream tasks
```

Example: DB schema (5 downstream) beats Auth (3) beats API integration (2).

### Validation (blocking errors → `valid: false`, no schedule)

`DUPLICATE_ID`, `UNKNOWN_DEPENDENCY`, `SELF_DEPENDENCY`, `CYCLE`. An unknown owner never blocks anything: post-processing sets it to `null` (unassigned).

### Risk rules (inside `analyse()`, max 3, severity order)

| Kind | Fires when | Text includes |
| --- | --- | --- |
| `late` | buffer < 0 | hours late, duration, available hours |
| `person_overload` | load ratio > 1 | member name, remaining vs capacity hours |
| `task_bottleneck` | task is `bottleneckTaskId` and downstream ≥ 3 | task title, downstream count, owner, status |

Every number in the text is read from the `Analysis`.

### Model call (P2)

- **Done already:** `api/_lib/llm/` supports both Claude and Gemini behind one call. `AI_PROVIDER=claude|gemini` picks the provider (if unset, whichever key is present, Gemini first). Defaults: `gemini-2.5-flash` and `claude-opus-5-5`, overridable with `GEMINI_MODEL` / `CLAUDE_MODEL`.
- P2 only writes: `const { data } = await generateJson(ExtractSchema, { system: SYSTEM_PROMPT, user: \`<project_text>${text}</project_text>\`, effort: 'medium' })`, then post-processes `data` into a `Project`.
- `generateJson` already handles: JSON-schema structured output for both providers, `JSON.parse` + Zod validation, refusal/safety blocks → `MODEL_REFUSED`, out of tokens or bad JSON → `MODEL_INVALID_OUTPUT`, 429 → `RATE_LIMITED`, 60 s abort → `TIMEOUT`, metadata-only logging.
- Catch `LlmError` in the endpoint and return `{ ok: false, error: { code, message, retryable } }`.
- Keys are read only in `api/`. Never put them in a `VITE_` variable. Check a provider with `npm run ai:smoke -- claude` or `-- gemini`.

---

## Timeline

| Time | Everyone / P1 | P2 | P3 |
| --- | --- | --- | --- |
| 0:00–0:20 | **Contracts:** P1 writes `types.ts` + `contracts.ts` from this file; all three read them | Start `sample-raw-input.txt` | Start `sample-project.json` against `types.ts` |
| 0:20–1:20 | Engine | AI endpoint + mock | Intake, store, graph, dashboard |
| 1:20–1:40 | **First integration:** real `analyse()` → dashboard, mock `extractProject()` → intake | | |
| 1:40–2:20 | **Vertical slice:** intake → extract → analyse → dashboard; Try the sample; one messy chat | | |
| 2:20–2:40 | **Deploy + live AI:** production test, mock fallback confirmed | | |
| 2:40–3:00 | **Demo freeze:** no features; rehearse; record a backup | | |

### Milestones

- [ ] **0:20** Contracts frozen; both fixtures typecheck against `types.ts`
- [ ] **1:20** Each piece works on its own
- [ ] **1:40** Real engine + mock extraction running in the app (first integration)
- [ ] **2:20** Full vertical slice works locally
- [ ] **2:40** Deployed; live AI tried once
- [ ] **3:00** Demo rehearsed, backup recorded

### Cut rules

- **1:40, integration broken:** everyone stops and fixes the interface mismatch before anything else.
- **2:20, live AI unreliable:** demo with Try the sample + mock mode.
- **2:40:** feature freeze, no exceptions.

---

## P1: Contracts + engine (`src/core/`)

### 0:00–0:20
- [ ] `src/core/types.ts`: spec stored types + `Analysis` above
- [ ] `src/ai/contracts.ts`: `ExtractInput`, `ExtractResponse`, `ApiError` (P2 owns it from here)
- [ ] Walk P2 and P3 through both files; freeze

### 0:20–1:20
- [ ] `validate()`: `DUPLICATE_ID`, `UNKNOWN_DEPENDENCY`, `SELF_DEPENDENCY`, `CYCLE`
- [ ] `analyse(project, now)` following the scheduling rules above
- [ ] `downstreamCount` per task + `bottleneckTaskId` with the tie-breakers
- [ ] Member metrics (remaining, critical hours, capacity, load ratio)
- [ ] 3 risk rules inside `analyse()`
- [ ] Vitest: linear, diamond, cycle, duplicate ID, bottleneck tie-break

### 1:20–3:00
- [ ] Lead first integration and the vertical slice
- [ ] **Gold-standard check:** verify the sample's critical path, bottleneck, overloaded member and late verdict by hand against `analyse()`
- [ ] Deploy

## P2: AI (`api/`, `src/ai/`)

### 0:00–0:20
- [ ] Read the current docs for structured outputs; check `output_config` in the installed SDK's types
- [ ] Draft `src/data/sample-raw-input.txt`: an informal, out-of-order chat that maps to the sample project

### 0:20–1:20
- [ ] Zod extract schema (spec: "Extract: model output schema", without `openQuestions`) → JSON schema
- [ ] `api/extract.ts`: validate input, call the model (settings above), map errors to the envelope
- [ ] System prompt: spec rules 1–8, text inside `<project_text>` tags
- [ ] Post-processing → `Project`: keys → `t1`, `t2`…; drop unknown deps; owner match (case-insensitive, first name; unknown → `null`); clamp estimates 0.25–80; `source: 'ai'`
- [ ] Mock: `VITE_MOCK_AI=1` makes `extractProject()` return `fixtures/extract-response.json` after 1.5 s; `MOCK_AI=1` does the same server-side
- [ ] `src/ai/extract.ts`: `extractProject(input)`

### 1:20–3:00
- [ ] Run the sample chat through the live endpoint; fix the prompt once if needed
- [ ] Confirm production works, and mock mode works with no key

## P3: UI (`src/store/`, `src/features/`)

### 0:00–0:20
- [ ] `fixtures/sample-project.json`: 10–14 tasks, 3–4 members; one unstarted task with ≥ 5 unfinished downstream; one member overloaded; critical path longer than the time available; deadline written as an offset applied on load

### 0:20–1:20
- [ ] Store: `project`, `setProject`, `reset`
- [ ] **Intake:** textarea + counter (30,000 max, never truncates), deadline, members (name + hours/day), Analyse (disabled until text + future deadline), Try the sample, loading state, error message + retry that keeps the input
- [ ] **Dashboard:** verdict bar (icon + text chip, buffer, finish vs deadline); React Flow + dagre left-to-right graph; node shows title, owner, remaining hours, status; critical path thicker with a "critical" label; bottleneck larger with a "blocks N" badge; top 3 risks; member load bars; Start over
- [ ] Lay out against a throwaway analysis only until P1's `analyse()` lands, then delete it

### 1:20–3:00
- [ ] Swap in real `analyse()` and `extractProject()`
- [ ] Sample looks right at 1280 px (no overlapping nodes)

---

## Definition of done (all must be ticked before the demo)

- [ ] App loads from the deployed URL
- [ ] Try the sample produces a complete project
- [ ] Sample has a deterministic `late` verdict
- [ ] Critical path is highlighted correctly (visible without colour)
- [ ] Exactly one bottleneck task is marked
- [ ] The bottleneck shows its unfinished downstream count
- [ ] Member overload is calculated by code
- [ ] Top risks show the same numbers as the verdict bar and graph
- [ ] Pasted text runs through extraction and analysis
- [ ] Mock mode works without an API key
- [ ] Live AI worked at least once, or the sample fallback is ready
- [ ] 90-second demo rehearsed

## Demo (90 seconds)

1. "Group projects fail on dependencies nobody can see."
2. Paste the messy chat and click Analyse.
3. The verdict: late by N hours. One node is marked: the task everything waits on, blocking N tasks, owned by the most overloaded person.
4. The risks explain why, with numbers computed by code, not the AI.
5. Fallback if live AI fails: Try the sample.
