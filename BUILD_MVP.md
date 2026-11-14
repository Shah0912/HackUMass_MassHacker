# Linchpin MVP: 3-Hour Build

The smallest version that still delivers the pitch: **paste a messy chat → see the one task everything waits on, and whether you'll be late.**

Assumes 3 people working in parallel (~9 person-hours). The full plan stays in [BUILD_PLAN.md](BUILD_PLAN.md) for after the demo.

## The one flow

1. **Intake:** paste text, set a deadline and team members, click Analyse (or Try the sample).
2. **Extract:** `/api/extract` turns the text into tasks with owners, estimates and dependencies (mock mode returns a fixture).
3. **Analyse:** `src/core` computes the critical path, slack, verdict, bottleneck and member load.
4. **Dashboard:** a verdict bar, a graph with the critical path and bottleneck highlighted, and a top-3 risks list.

## In vs. out

| In (MVP) | Out (cut until after the demo) |
| --- | --- |
| F-01 Intake (minimal form) | F-03 Editable review table (no review screen at all) |
| F-02 AI extraction + mock mode | F-04 Validation banner (show cycle errors as one message) |
| F-05 Graph view (layout, critical path, bottleneck badge) | F-08 Fix suggestions with `bufferGainHours` |
| F-06 Critical path, slack, verdict | F-10 Saved-projects list, import/export |
| F-07 Bottleneck + member load | F-11 What-if, F-12 Rescue plan, F-13 to F-23 |
| F-08 lite: 3 risk rules, text only | Task drawer editing, graph filters, evals, repair retry |
| F-09 Sample project | Routing (one page with two states), polish, a11y pass |

## Milestones

- [ ] **0:30** Contracts merged: `types.ts`, `sample-project.json`, `extract-response.json`
- [ ] **2:00** Each piece works alone (engine tests, endpoint returns tasks, dashboard renders the fixture)
- [ ] **2:30** Wired end to end with mock mode
- [ ] **3:00** Deployed, live AI tried once, demo rehearsed

**Cut rule:** if live AI isn't working at 2:30, demo with "Try the sample" plus mock mode.

---

## Everyone (0:00–0:30)

- [ ] **P1** writes `src/core/types.ts`: `Member`, `Task`, `Project`, `TaskMetrics`, `MemberMetrics`, `Risk` (no `suggestion`), `Analysis` (copy from the spec and drop unused fields)
- [ ] **P2** writes `fixtures/extract-response.json` (8–10 tasks)
- [ ] **P3** writes `fixtures/sample-project.json` (10–14 tasks, 3–4 members, one obvious bottleneck)
- [ ] All three read `types.ts` once, then it's frozen

---

## P1: Engine (`src/core/`) (0:30–2:00)

- [ ] `validate(project)`: `UNKNOWN_DEPENDENCY`, `SELF_DEPENDENCY`, `CYCLE` only
- [ ] `analyse(project, now)`:
  - [ ] Remaining hours (done 0, in progress ½, else full)
  - [ ] Kahn's topological sort, ties by ID
  - [ ] Forward and backward pass, slack, `isCritical`
  - [ ] Critical path walk-back
  - [ ] Available hours, buffer, verdict (`late` / `at_risk` < 15% / `on_track`)
  - [ ] `downstreamCount` per task
  - [ ] Member remaining hours, capacity, load ratio
- [ ] `risks(analysis)`: only `late`, `person_overload`, `task_bottleneck`, as plain text with numbers from the analysis
- [ ] Vitest: linear, diamond, cycle
- [ ] Run it on `sample-project.json`; tune the fixture with P3 until the verdict is `late` and the bottleneck stands out

### 2:00–3:00
- [ ] Wire intake → extract → analyse → dashboard in the store
- [ ] Deploy to Vercel and set `ANTHROPIC_API_KEY`

---

## P2: AI (`api/`, `src/ai/`) (0:30–2:00)

- [ ] Read the current Claude API docs for structured outputs and streaming
- [ ] Zod schema for the extract output (spec: "Extract: model output schema")
- [ ] `api/extract.ts`: `claude-opus-5-5`, streaming + `finalMessage()`, structured output from the Zod schema
- [ ] System prompt: spec rules 1–8, with the text in `<project_text>` tags (skip the few-shot example)
- [ ] Post-processing: keys → `t1`, `t2`…, drop unknown dependencies, case-insensitive owner match, clamp estimates
- [ ] Errors: `{ ok: false, error: { code, message, retryable } }` for too long, refusal and upstream failures
- [ ] Mock: `MOCK_AI=1` on the server and `VITE_MOCK_AI=1` on the client return `extract-response.json`
- [ ] Client helper `extractProject(input) → Project`
- [ ] Write `src/data/sample-raw-input.txt`, a messy chat that maps to the sample project

### 2:00–3:00
- [ ] Run the sample chat through the live endpoint; tweak the prompt once if the output is bad
- [ ] Help P1 with wiring and the deploy

---

## P3: UI (`src/features/`, `src/store/`) (0:30–2:00)

- [ ] Zustand store: `project`, `setProject`, with `persist` middleware (one line, survives reload)
- [ ] **Intake view:** textarea with a character counter (max 30,000), deadline, members (name + hours/day), Analyse and Try the sample buttons, loading state, error message with retry
- [ ] **Dashboard view:**
  - [ ] Verdict bar: chip with icon + text (Late by N h / At risk / On track), buffer, finish vs deadline
  - [ ] React Flow + dagre left-to-right graph; node shows title, owner, hours, status
  - [ ] Critical path: thicker border and edges plus a "critical" label (not colour alone)
  - [ ] Bottleneck: larger node with a "blocks N" badge
  - [ ] Side list: top 3 risks and member load bars
  - [ ] "Start over" button back to intake
- [ ] Build against `sample-project.json` + `analyse()` (use a hand-written analysis until P1 lands)

### 2:00–3:00
- [ ] Swap in real data from the extract flow
- [ ] Make the sample look good at 1280 px (no overlapping nodes)

---

## Demo (90 seconds)

1. "Group projects fail on dependencies nobody can see."
2. Paste the messy chat and click Analyse.
3. The verdict says late by N hours. One node is marked: the task everything waits on, owned by the most overloaded person.
4. The risks list explains why with real numbers, all computed by code, not the AI.
