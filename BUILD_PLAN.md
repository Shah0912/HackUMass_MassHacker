# Linchpin: 3-Person Build Plan & Checklist

Derived from [LinchpinPlanRequirements.md](LinchpinPlanRequirements.md). The spec's 5 workstreams (A–E, 39.5 h total) are folded into 3 owners at ~12–14.5 h each. Hours are elapsed from the start (H0).

## Who owns what

| Person | Role | Spec workstreams | Owns directories | Tasks | Hours |
| --- | --- | --- | --- | --- | --- |
| **P1** ______ | Engine & integration lead | A + most of E | `src/core/`, `fixtures/`, `src/app/`, config | T01, T02, T03, T04, T05, T13, T17, T18 | 14.5 |
| **P2** ______ | AI service & review table | B + review half of C + sample data | `api/`, `src/ai/`, `evals/`, `src/features/review/`, `src/data/` | T06, T07, T10, T14, T16 | 12 |
| **P3** ______ | Store, intake & dashboard | D + intake half of C + store | `src/store/`, `src/components/`, `src/features/intake/`, `src/features/dashboard/`, `src/features/whatif/`, `src/features/rescue/` | T08, T09, T11, T12, T15 | 13 |

**Why this split:** P1 owns the one serial chain everyone waits on (T01→T05) and is free when integration (T13) starts. P3 builds the dashboard against `fixtures/sample-analysis.json` from H7 so it never waits on the engine. P2 starts the AI pipeline the moment contracts freeze and owns the sample project, which needs the real engine to verify.

## Timeline

| Hours | P1 | P2 | P3 |
| --- | --- | --- | --- |
| H0–H1 | T01 Scaffold & deploy | Read spec, Claude API docs, draft extract prompt | Read spec, sketch S1/S2/S5 layouts |
| H1–H2 | **T02 Contracts** (all three review) | Review T02 | Review T02 |
| H2–H5 | T03 Validation (→H3.5), T04 Schedule (→H6) | T06 Extract endpoint + mock | T08 Store (→H4), T11 Graph canvas (→H7) |
| H5–H8.5 | T05 Bottlenecks & risks (H6–8.5) | T07 Post-processing & evals (→H7), T10 Review table (H7–10) | T12 Dashboard panels on fixtures (H7–10) |
| H8.5–H12 | Perf tests, PR review, route shell, backup on anything slipping | T14 Sample project (H10–11), eval run | Swap real engine into T12; T09 Intake (H10–12) |
| H12–H14 | **T13 End-to-end wiring** | Bug-fix support for T13 | Bug-fix support for T13 |
| H14–H17 | T17 Polish (H14–16) | T16 AI rescue plan | T15 What-if mode |
| H17–H19 | **T18 Demo, recording, final deploy** | Rehearse demo | Rehearse demo |
| H19–H24 | Buffer / P1 features | Buffer / P1 features | Buffer / P1 features |

**Milestones (adjusted for 3 people)**

- [ ] **M0 – H2** Contracts frozen: `types.ts`, `contracts.ts`, both fixtures merged
- [ ] **M1 – H8.5** Engine tests pass; sample project renders as a graph
- [ ] **M2 – H14** Paste text → graph, verdict, risks. All P0 features work
- [ ] **M3 – H17** What-if and AI rescue plan work
- [ ] **M4 – H19** Deployed, script rehearsed once, backup recording saved

---

## Everyone (H0–H2)

- [ ] Copy "Rules for build agents" from the spec into `CLAUDE.md`
- [ ] Review `src/core/types.ts` against the spec's Data requirements, line by line
- [ ] Review `src/ai/contracts.ts` (request/response shapes, error codes)
- [ ] Agree on branch naming and PR flow (small PRs into `main`, P1 merges)
- [ ] Each person can run `npm run dev` and `npm test` locally
- [ ] Set `ANTHROPIC_API_KEY` in Vercel env only (never in `src/`)

---

## P1 – Engine & integration lead

### T01 Scaffold repo, tooling, deploy pipeline (H0–H1)
- [ ] Vite + React + TypeScript + Tailwind
- [ ] Zustand, `@xyflow/react`, dagre, Zod, Vitest, `@anthropic-ai/sdk` installed
- [ ] Folder skeleton matching the ownership table
- [ ] Scripts: `dev`, `test`, `typecheck`, `eval:extract`
- [ ] Vercel project linked; `api/` functions deploy; preview URL works
- [ ] `VITE_MOCK_AI` / `MOCK_AI` env flags wired

### T02 Freeze contracts (H1–H2) — the task bottleneck; all 16 later tasks depend on it
- [ ] `src/core/types.ts` exactly matches the spec's stored + derived types
- [ ] Zod schemas for `Project` (shared by store, import, server)
- [ ] `src/ai/contracts.ts`: extract/rescue request + response, error envelope, error codes
- [ ] `fixtures/sample-project.json` (valid `Project`, placeholder until T14)
- [ ] `fixtures/sample-analysis.json` (hand-written `Analysis` for that project)
- [ ] `fixtures/extract-response.json` (mock `/api/extract`)
- [ ] Merged and announced: **contracts frozen**

### T03 Validation and cycle detection (H2–H3.5) — F-04
- [ ] `DUPLICATE_ID`, `UNKNOWN_DEPENDENCY`, `SELF_DEPENDENCY`, `UNKNOWN_OWNER`, `BAD_ESTIMATE`, `EMPTY_TITLE`, `TOO_MANY_TASKS`
- [ ] `CYCLE`: one issue per loop, `taskIds` in loop order
- [ ] Warnings: `NO_OWNER`, `ORPHAN_TASK` (> 3 tasks)
- [ ] Cut tasks ignored; dependency on a cut task rewired to its dependencies
- [ ] `fixtures/graphs/*.json`: linear, diamond, cycle, disconnected, all-done, empty
- [ ] Test: cycle A→B→C yields exactly one `CYCLE` naming A, B, C
- [ ] Test: 200 tasks validate in < 20 ms

### T04 Topological order & schedule (H3.5–H6) — F-06
- [ ] Remaining hours (done/cut 0, in progress ½, todo/blocked full)
- [ ] Kahn's sort, ties by task ID
- [ ] Forward pass, duration, backward pass, slack, `isCritical`
- [ ] Critical path walk-back, ties to lowest ID
- [ ] Deadline → available hours → buffer → verdict (`late` / `at_risk` < 15% / `on_track`)
- [ ] `analyse(project, now)` never reads the clock
- [ ] Tests: linear, diamond, disconnected, all-done, empty; determinism
- [ ] Test: 200 tasks analyse in < 50 ms

### T05 Bottlenecks, risk rules, suggestions (H6–H8.5) — F-07, F-08
- [ ] `downstreamCount` per task (distinct unfinished, transitive)
- [ ] Member metrics: remaining, critical hours, capacity, load ratio (99 when capacity 0)
- [ ] All 8 risk rules in spec order; sort by severity; cap at 5
- [ ] Suggestions: reassign / cut re-run analysis on a copy → `bufferGainHours`; drop if ≤ 0
- [ ] Every number in risk text read from the analysis
- [ ] Test: overloaded member has load ratio > 1
- [ ] Test: healthy project → no risks
- [ ] Notify P3: real engine ready to replace the fixture
- **If behind at H6:** hand suggestion logic to P2

### H8.5–H12 (slack)
- [ ] Regenerate `fixtures/sample-analysis.json` from the real engine
- [ ] Route skeleton: `/`, `/new`, `/p/:id/review`, `/p/:id`
- [ ] Review P2/P3 PRs; pair on whatever is slipping

### T13 End-to-end wiring, routing, error states (H12–H14) — all P0
- [ ] S1 Projects landing: New project, Try the sample, saved list, import, export, delete-with-confirm
- [ ] Intake → extracting → review → dashboard flows through the store
- [ ] `?task=` opens drawer; reload restores the same project and view
- [ ] API error codes map to plain messages + Try again / Edit text / Use sample
- [ ] Full flow works with `VITE_MOCK_AI=1` and no backend
- [ ] **M2 check:** every P0 acceptance box below is ticked

### T17 Polish (H14–H16) — NFRs
- [ ] Every async view has loading (skeleton), empty and error states (N-09)
- [ ] No state shown by colour alone; WCAG AA contrast (N-06)
- [ ] Keyboard: Tab order, Esc closes drawers/modals, arrow keys on canvas (N-07)
- [ ] Copy pass on all screens
- [ ] Spot-check Chrome, Edge, Firefox, Safari at 1280 px (N-08)

### T18 Demo script, backup recording, final deploy (H17–H19)
- [ ] Final deploy to Vercel; smoke-test live and mock mode
- [ ] 3-minute script from the spec, rehearsed once with all three
- [ ] Backup screen recording saved locally and in the cloud
- [ ] Offline fallback tested (sample + mock mode)

---

## P2 – AI service & review table

### T06 Extraction prompt, schema, `/api/extract`, mock mode (H2–H5) — F-02
- [ ] Read current Claude API docs first (no SDK calls from memory)
- [ ] System prompt covers all 9 rules from the spec + one few-shot example
- [ ] Raw text only in the user message inside `<project_text>` tags
- [ ] `claude-opus-5-5`, streaming + `finalMessage()`, `max_tokens` 16000, effort `medium`
- [ ] Structured output via JSON schema generated from Zod (`additionalProperties: false`)
- [ ] `cache_control` on system prompt + schema
- [ ] Check `stop_reason`; `refusal` / `max_tokens` → error code, never partial data
- [ ] Error envelope + codes: `INPUT_TOO_LONG`, `INPUT_INVALID`, `MODEL_REFUSED`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `TIMEOUT`
- [ ] Logs: token counts, latency, error codes only — never raw text (N-04)
- [ ] `MOCK_AI=1` server mock and `VITE_MOCK_AI=1` client mock (1.5 s delay)

### T07 Post-processing, repair retry, evals (H5–H7) — F-02
- [ ] Zod validate; one repair retry with errors; else `MODEL_INVALID_OUTPUT`
- [ ] Keys → `t1`, `t2`…; rewrite `dependsOnKeys`
- [ ] Unknown dependency keys dropped + open question each
- [ ] Owner matching: case-insensitive, first-name; unknown → new member or null + question
- [ ] Clamp estimates 0.25–80, round to 0.25; `source: 'ai'`
- [ ] Run `validate()` from `src/core`; keep cycles for human review
- [ ] `evals/extract/`: demo chat, tidy list, no owners, circular, 30k chars, injection
- [ ] `npm run eval:extract` reports recall, dependency precision, invented owners, schema failures, injection, latency
- [ ] Targets met: recall ≥ 80%, precision ≥ 80%, 0 invented owners, 0 schema failures, injection never followed, < 30 s at 30k

### T10 Review screen: editable table, validation banner (H7–H10) — F-03, F-04
- [ ] Table: title, owner select, estimate, status, depends-on multi-select, confidence icon, evidence popover, delete
- [ ] Add row; editing a row sets `source: 'user'`
- [ ] Deleting a task removes it from others' `dependsOn`
- [ ] Task cannot depend on itself (excluded from the multi-select)
- [ ] Low confidence + inferred estimates shown with icon **and** text
- [ ] Banner: "Found N tasks and M dependencies"; issues clickable → focus row
- [ ] "Show graph" disabled while errors exist
- [ ] Fully keyboard operable

### T14 Demo sample project and raw text (H10–H11) — F-09
- [ ] `src/data/sample-raw-input.txt`: real-feeling chat, out of order, informal, ≥ 1 implied dependency
- [ ] `fixtures/sample-project.json` rebuilt: 14–18 tasks, 4 members
- [ ] One unstarted task with ≥ 5 unfinished downstream (the linchpin)
- [ ] One member owns > 50% of critical hours
- [ ] Critical path ≈ 6 h longer than available time
- [ ] One reassignment flips the verdict to on track
- [ ] 2 low-confidence tasks, 1 unowned task
- [ ] Deadline stored as an offset from load time
- [ ] Verified with the real engine: risks include late, person overload, task bottleneck
- [ ] Sample raw text extracts to 12–20 tasks with no validation errors

### T16 AI rescue plan with verification (H14–H17) — F-12
- [ ] `POST /api/rescue`: tasks + computed analysis, **no raw text**; effort `high`
- [ ] Up to 5 actions: cut / reassign / split / start_now / reduce_scope
- [ ] Code applies each to a copy, re-runs `analyse`, keeps only actions improving buffer or worst load
- [ ] Unknown task/member IDs rejected; displayed hours are computed, not the model's
- [ ] All actions fail → show deterministic suggestions instead
- [ ] S8 panel: Generate plan, action cards, Try in what-if, loading/empty/error states (coordinate with P3)

---

## P3 – Store, intake & dashboard

### T08 Store, `localStorage`, JSON import/export (H2–H4) — F-10
- [ ] Zustand store with keys `linchpin:v1:projects`, `:active`, `:intakeDraft`
- [ ] Writes debounced 300 ms; every read/write in try/catch
- [ ] Unknown `schemaVersion` listed as unreadable, offered for export, never deleted
- [ ] Export `<name>.linchpin.json`; import → Zod validate → new `id` → save
- [ ] Invalid import file changes nothing
- [ ] Export then import gives an identical project
- [ ] Selectors that call `analyse(project, now)` (never stored)

### T11 Graph canvas (H4–H7) — F-05
- [ ] React Flow + dagre, left-to-right layout, pan/zoom/fit
- [ ] Custom node: title, owner, remaining hours, status; border = owner colour
- [ ] Critical path heavier with a marker (visible in greyscale)
- [ ] Bottleneck nodes larger with "blocks N" badge
- [ ] Click node → dims everything not upstream/downstream
- [ ] Toolbar: colour by owner/status, member filter, hide done, critical-path only, legend
- [ ] Sample renders with no overlap at 1280×720; 100 tasks pan/zoom smoothly

### T12 Dashboard panels (H7–H10, fixtures first) — F-05 to F-08
- [ ] Verdict bar: chip with icon + text, finish vs deadline, buffer, critical path length, action buttons
- [ ] Risks tab: ranked cards with fix; click highlights tasks and people on canvas
- [ ] People tab: load bars, critical hours, open tasks; click filters canvas
- [ ] Healthy project shows a positive empty state
- [ ] S6 task drawer: editable fields, read-only metrics, Blocked by / Blocks lists, evidence, delete, cut
- [ ] Editing in drawer updates graph and verdict without reload
- [ ] At H8.5: swap fixture for real `analyse()` from P1

### T09 Intake screen (H10–H12) — F-01
- [ ] Text box with counter (30,000 max); "Paste the sample chat" link
- [ ] Project name, deadline, work hours/day (default 6), members (name, hours/day), detect-members checkbox
- [ ] Analyse disabled until text + future deadline
- [ ] Over 30,000 chars shows error and keeps the text (never truncated)
- [ ] Form survives reload (`intakeDraft`)
- [ ] Privacy notice: text sent to an AI service, not stored on a server
- [ ] S3 Extracting state: 4 live steps, Cancel keeps text, error state with retry / edit / use sample

### T15 What-if mode (H14–H17) — F-11
- [ ] Draft copy of the project; coloured "What-if" frame
- [ ] Reassign (drag node onto member), cut, re-estimate slider, mark done
- [ ] Verdict bar shows before and after side by side
- [ ] Change list with per-item undo; Apply / Discard
- [ ] Each change recomputes in < 100 ms; Discard restores exact previous state
- [ ] Cutting a task keeps its dependents connected to its dependencies

---

## Hand-offs (who waits on whom)

| When | From | To | What |
| --- | --- | --- | --- |
| H2 | P1 | P2, P3 | Frozen `types.ts`, `contracts.ts`, fixtures |
| H3.5 | P1 | P2 | `validate()` for T07 post-processing and T10 banner |
| H4 | P3 | P2 | Store API for the review table (T10) |
| H8.5 | P1 | P3, P2 | Real `analyse()` for dashboard and sample verification |
| H11 | P2 | P1, P3 | Final sample project + raw chat |
| H12 | P2, P3 | P1 | T07, T09, T10, T12 merged → start T13 |
| H17 | P2, P3 | P1 | T15, T16 merged → final deploy |

## Cut rules (adjusted for 3 people)

- **H14.5:** feature freeze on P0 scope.
- **M2 later than H16.5:** drop T16 (rescue plan); demo the deterministic risk panel.
- **M2 later than H18.5:** also drop T15 (what-if); demo P0 with the sample project.
- **Live AI unreliable at H20:** demo with sample + mock mode; show live paste as the recorded clip.
- **P1 behind at H6:** P2 takes T05's suggestion logic.
- P1 features beyond F-11/F-12 (F-13 to F-17) start only after M4.

## Definition of done (every task)

- [ ] Acceptance criteria pass
- [ ] `npm run typecheck` and `npm test` pass
- [ ] Loading, empty and error states exist
- [ ] No files changed outside your directories (ask the owner otherwise)
