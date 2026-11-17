# ClearPath

From messy meeting notes to a clear, actionable project plan.

## Inspiration

Every group project we've done starts with a long call where everyone throws out ideas. When it ends, nobody is quite sure who's doing what.

Someone has to turn that call into a plan, and that plan usually has holes. A job nobody picked up, an idea someone mentioned once and everyone forgot, or a step that can't start until someone else finishes theirs.

We kept being the person stuck writing that plan, so we built something to do it for us.

## What It Does

You give ClearPath your messy notes, and it gives you back a plan.

### 1. Turn Unstructured Notes Into Tasks

Paste in meeting notes, a call transcript, or a planning document, or upload a `.txt`, `.md`, or `.csv` file.

ClearPath extracts:

- Tasks and action items
- Assigned owners
- Estimated durations
- Dependencies between tasks

If something would take more than 4 hours, ClearPath breaks it into smaller pieces that someone could actually sit down and start.

When the notes don't specify something, ClearPath doesn't make it up. Tasks with missing owners or vague estimates are flagged for review instead of being silently filled in with guesses.

### 2. Review Before You Commit

Nothing goes onto your project plan until you've reviewed it.

You can:

- Review and edit every extracted task.
- Correct estimates and dependencies.
- Assign owners to unassigned tasks.
- Add team members who weren't on the call and give them work.

You stay in control of what makes it into the plan.

### 3. Visualize Your Project

Once approved, ClearPath turns your project into an interactive dependency graph.

It highlights:

- **Critical Path:** The chain of tasks that determines your project's finish date.
- **Bottlenecks:** The task everything else is waiting on.
- **Schedule Risks:** Deadlines you're likely to miss and tasks with very little spare time.
- **Workload Imbalances:** When one person is carrying most of the important work.
- **Unassigned Work:** Tasks that nobody owns.
- **Uncertain Estimates:** Tasks whose durations may need another look.

You can also add new tasks directly from the graph and specify what each task depends on.

### 4. Experiment With What-If Mode

Want to see what happens if you reassign a task, cut some scope, or change a task's status?

Switch to What-If Mode.

You can:

- Drag tasks onto different team members.
- Remove tasks.
- Change task statuses.
- See the projected finish date update instantly.

Every change is tracked separately with its own undo action. Nothing is saved until you explicitly approve it.

### 5. Generate AI-Powered Rescue Plans

Running behind schedule? Ask ClearPath for a rescue plan.

The AI suggests potential fixes, such as:

- Cutting a task.
- Reassigning work to someone else.
- Splitting a task.
- Starting a task immediately.
- Reducing scope.

But we don't just show suggestions that sound convincing.

Each suggestion is tested against a copy of your project using our scheduling engine. ClearPath only shows changes that actually improve the schedule, along with how much time each one saves.

### 6. Save and Export Your Projects

Projects are saved locally in your browser and sync to the cloud when configured.

You can also export a project and import it again later.

## How We Built It

### Frontend

React, TypeScript, and Vite power the frontend. Tailwind CSS handles styling. Zustand manages application state. React Flow and dagre render and automatically lay out the task dependency graph.

### AI Integration

We primarily use Google Gemini, but every model call goes through a lightweight wrapper. This means we can switch between Gemini, Claude, or Grok simply by changing an environment variable.

All AI calls run on the server, so API keys never reach the browser.

We also enforce strict output validation:

- Every AI response must match a predefined Zod schema.
- Invalid responses trigger one automatic retry.
- The output is cleaned and normalized before entering the application.

### Deterministic Planning Engine

One of our most important architectural decisions was keeping the planning mathematics completely separate from AI.

The AI reads your notes. Our TypeScript engine does the math.

Every number displayed in ClearPath, including project completion dates, task durations and slack, critical paths, and team workload distribution, is calculated deterministically using topological sorting (Kahn's algorithm) and critical-path analysis.

This makes the results consistent, reproducible, and independently verifiable.

After the AI responds, our code also:

- Fixes task IDs.
- Matches extracted names to actual team members.
- Removes dependencies on nonexistent tasks.
- Keeps estimates within sensible ranges.
- Splits any remaining tasks longer than four hours.

### Backend and Infrastructure

MongoDB stores projects under an anonymous workspace ID, so users don't need an account. If the database is unavailable, the application continues working locally in the browser.

Vercel handles deployment. We also support self-hosting through a lightweight Node.js server behind Nginx.

### Testing

We have over 70 Vitest unit tests covering core functionality, plus additional checks against live AI model responses.

## Run it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works end to end with no API key if you set `VITE_MOCK_AI=1` in `.env.local`. To call a real model, set `AI_PROVIDER` to `gemini`, `claude`, or `grok` and add the matching key (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `XAI_API_KEY`). Keys stay on the server.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (client) |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | Typecheck with `tsc --noEmit` |
| `npm run ai:smoke` | One live call to check a provider key |
| `npm start` | Self-hosted Node server |
