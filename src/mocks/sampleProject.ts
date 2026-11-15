// The demo sample (F-09). Deadline is set relative to load time so the verdict is always
// "late by ~6 h". Built to match src/data/sample-raw-input.txt.
import type { Member, Project, Task } from '@/core/types';
import { memberColor } from '@/core/types';
import sampleRawInput from '@/data/sample-raw-input.txt?raw';

export { sampleRawInput };

/** Hours from load time to the deadline: 56 h → 2.33 days × 6 h/day = 14 h available. */
export const SAMPLE_DEADLINE_OFFSET_HOURS = 56;

const members: Member[] = [
  { id: 'm1', name: 'Sam', hoursPerDay: 4, color: memberColor(0) },
  { id: 'm2', name: 'Priya', hoursPerDay: 4, color: memberColor(1) },
  { id: 'm3', name: 'Leo', hoursPerDay: 3, color: memberColor(2) },
  { id: 'm4', name: 'Maya', hoursPerDay: 5, color: memberColor(3) },
];

type T = Omit<Task, 'source'> & { source?: Task['source'] };
const tasks: T[] = [
  { id: 't1', title: 'Set up repo and deploy pipeline', ownerId: 'm3', estimateHours: 1, status: 'done', dependsOn: [], confidence: 'high', evidence: 'ok repo is up, CI deploys to vercel on push' },
  { id: 't2', title: 'Design the database schema', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t1'], confidence: 'high', evidence: "I'll do the backend. db schema first, should be ~3h" },
  { id: 't3', title: 'Build the auth API', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t2'], confidence: 'high', evidence: 'then auth (3h)' },
  { id: 't4', title: 'Build menu and orders API', ownerId: 'm1', estimateHours: 5, status: 'todo', dependsOn: ['t2'], confidence: 'high', evidence: "the menu + orders endpoints, that's the big one, maybe 5h" },
  { id: 't5', title: 'Seed demo restaurant data', ownerId: null, estimateHours: 1.5, status: 'todo', dependsOn: ['t2'], confidence: 'medium', estimateInferred: true, evidence: 'someone has to seed fake restaurants or the demo is empty' },
  { id: 't6', title: 'Design UI mockups in Figma', ownerId: 'm4', estimateHours: 4, status: 'in_progress', dependsOn: [], confidence: 'medium', estimateInferred: true, evidence: "I'm on the figma mockups, like halfway done" },
  { id: 't7', title: 'Build the login screen', ownerId: 'm2', estimateHours: 2, status: 'todo', dependsOn: ['t3', 't6'], confidence: 'high', evidence: 'login screen is like 2h once auth is there' },
  { id: 't8', title: 'Build the menu browsing screen', ownerId: 'm2', estimateHours: 3, status: 'todo', dependsOn: ['t4', 't6'], confidence: 'high', evidence: "I literally can't start the menu screen until the menu API exists" },
  { id: 't9', title: 'Build the checkout flow', ownerId: 'm2', estimateHours: 4, status: 'todo', dependsOn: ['t4', 't8'], confidence: 'medium', estimateInferred: true, evidence: "checkout no idea, it depends what Sam's api looks like" },
  { id: 't10', title: 'Integrate Stripe test payments', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t4'], confidence: 'low', estimateInferred: true, evidence: 'I guess me? stripe test mode, needs the orders api first' },
  { id: 't11', title: 'Make the pitch deck', ownerId: 'm4', estimateHours: 3, status: 'todo', dependsOn: [], confidence: 'high', evidence: "I'll make the pitch deck too, 3h-ish" },
  { id: 't12', title: 'Test end to end on phones', ownerId: 'm3', estimateHours: 2, status: 'todo', dependsOn: ['t5', 't7', 't9', 't10'], confidence: 'medium', estimateInferred: true, evidence: "I'm doing end to end testing on phones once checkout works" },
  { id: 't13', title: 'Record the demo video', ownerId: 'm4', estimateHours: 1.5, status: 'todo', dependsOn: ['t12'], confidence: 'high', evidence: "I'll record the demo video after Leo's testing, 1.5h" },
  { id: 't14', title: 'Fix bugs found in testing', ownerId: 'm3', estimateHours: 2, status: 'todo', dependsOn: ['t12'], confidence: 'low', estimateInferred: true, evidence: "we'll probably need a bug fix pass after testing too" },
  { id: 't15', title: 'Write README and Devpost submission', ownerId: 'm3', estimateHours: 1, status: 'todo', dependsOn: ['t11', 't13', 't14'], confidence: 'high', evidence: "I'll write the README + devpost submission at the very end, 1h" },
];

export function buildSampleProject(now: Date = new Date()): Project {
  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Campus Eats (sample)',
    deadline: new Date(now.getTime() + SAMPLE_DEADLINE_OFFSET_HOURS * 3_600_000).toISOString(),
    workHoursPerDay: 6,
    members: members.map((m) => ({ ...m })),
    tasks: tasks.map((t) => ({ source: 'ai', ...t, dependsOn: [...t.dependsOn] })),
    rawInput: sampleRawInput,
    openQuestions: [
      { id: 'q1', taskId: 't5', field: 'owner', question: 'Who will seed the demo restaurant data?', dismissed: false },
      { id: 'q2', taskId: 't9', field: 'estimate', question: 'How long will the checkout flow take?', dismissed: false },
      { id: 'q3', taskId: 't10', field: 'owner', question: 'Is Sam definitely doing payments?', dismissed: false },
    ],
    createdAt: iso,
    updatedAt: iso,
  };
}
