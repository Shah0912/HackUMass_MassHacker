// The demo sample (F-09). Deadline is set relative to load time so the verdict is always
// "late by ~6 h". Built to match src/data/sample-raw-input.txt.
import type { Member, Project, Task } from '@/core/types';
import { memberColor } from '@/core/types';
import { uuid } from '@/store/uuid';
import sampleRawInput from '@/data/sample-raw-input.txt?raw';

export { sampleRawInput };

/** Hours from load time to the deadline: 46 h → 1.92 days × 6 h/day = 11.5 h available (critical path 17.5 h → late by 6 h). */
export const SAMPLE_DEADLINE_OFFSET_HOURS = 46;

const members: Member[] = [
  { id: 'm1', name: 'Sam', hoursPerDay: 4, color: memberColor(0) },
  { id: 'm2', name: 'Priya', hoursPerDay: 4, color: memberColor(1) },
  { id: 'm3', name: 'Leo', hoursPerDay: 3, color: memberColor(2) },
  { id: 'm4', name: 'Maya', hoursPerDay: 5, color: memberColor(3) },
];

type T = Omit<Task, 'source'> & { source?: Task['source'] };
const tasks: T[] = [
  { id: 't1', title: 'Set up repo and deploy pipeline', ownerId: 'm3', estimateHours: 1, status: 'done', dependsOn: [], confidence: 'high', evidence: 'Repo is up and CI deploys to Vercel on every push' },
  { id: 't2', title: 'Design the database schema', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t1'], confidence: 'high', evidence: "I'll do the backend. Database schema first, should be about three hours." },
  { id: 't3', title: 'Build the auth API', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t2'], confidence: 'high', evidence: 'Then auth, three hours' },
  { id: 't4', title: 'Build the menu API', ownerId: 'm1', estimateHours: 2.5, status: 'todo', dependsOn: ['t2'], confidence: 'high', evidence: "the menu and orders endpoints. That's the big one, maybe five hours." },
  { id: 't17', title: 'Build the orders API', ownerId: 'm1', estimateHours: 2.5, status: 'todo', dependsOn: ['t4'], confidence: 'high', estimateInferred: true, evidence: "the menu and orders endpoints. That's the big one, maybe five hours." },
  { id: 't5', title: 'Seed demo restaurant data', ownerId: null, estimateHours: 1.5, status: 'todo', dependsOn: ['t2'], confidence: 'medium', estimateInferred: true, evidence: 'Someone has to seed fake restaurants or the demo is empty.' },
  { id: 't6', title: 'Design UI mockups in Figma', ownerId: 'm4', estimateHours: 4, status: 'in_progress', dependsOn: [], confidence: 'medium', estimateInferred: true, evidence: "I'm on the Figma mockups, about halfway done." },
  { id: 't7', title: 'Build the login screen', ownerId: 'm2', estimateHours: 2, status: 'todo', dependsOn: ['t3', 't6'], confidence: 'high', evidence: 'Login screen is about two hours once auth is there.' },
  { id: 't8', title: 'Build the menu browsing screen', ownerId: 'm2', estimateHours: 3, status: 'todo', dependsOn: ['t4', 't6'], confidence: 'high', evidence: "I can't start the menu screen until the menu API exists." },
  { id: 't9', title: 'Build the checkout flow', ownerId: 'm2', estimateHours: 4, status: 'todo', dependsOn: ['t17', 't8'], confidence: 'medium', estimateInferred: true, evidence: "Checkout, no idea, it depends what Sam's API looks like." },
  { id: 't10', title: 'Integrate Stripe test payments', ownerId: 'm1', estimateHours: 3, status: 'todo', dependsOn: ['t17'], confidence: 'low', estimateInferred: true, evidence: 'I guess me? Stripe test mode. It needs the orders API first.' },
  { id: 't11', title: 'Make the pitch deck', ownerId: 'm4', estimateHours: 3, status: 'todo', dependsOn: [], confidence: 'high', evidence: "I'll make the pitch deck too, three hours-ish." },
  { id: 't12', title: 'Test end to end on phones', ownerId: 'm3', estimateHours: 2, status: 'todo', dependsOn: ['t5', 't7', 't9', 't10', 't16'], confidence: 'medium', estimateInferred: true, evidence: "I'm doing end-to-end testing on phones once checkout works." },
  { id: 't13', title: 'Record the demo video', ownerId: 'm4', estimateHours: 1.5, status: 'todo', dependsOn: ['t12'], confidence: 'high', evidence: "I'll record the demo video after Leo's testing, an hour and a half." },
  { id: 't14', title: 'Fix bugs found in testing', ownerId: 'm3', estimateHours: 2, status: 'todo', dependsOn: ['t12'], confidence: 'low', estimateInferred: true, evidence: "We'll probably need a bug fix pass after testing too." },
  { id: 't15', title: 'Write README and Devpost submission', ownerId: 'm3', estimateHours: 1, status: 'todo', dependsOn: ['t11', 't13', 't14'], confidence: 'high', evidence: "I'll write the README and the Devpost submission at the very end, one hour." },
  // New requirement raised mid-meeting (sponsor prize).
  { id: 't16', title: 'Add dietary filters to the menu', ownerId: 'm4', estimateHours: 2, status: 'todo', dependsOn: ['t4', 't6'], confidence: 'high', evidence: "I'll take the dietary filters, about two hours. It needs the menu API to return the tags though." },
];

export function buildSampleProject(now: Date = new Date()): Project {
  const iso = now.toISOString();
  return {
    schemaVersion: 1,
    id: uuid(),
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
      { id: 'q4', taskId: 't16', field: 'scope', question: 'Which dietary filters does the sponsor prize need (vegan, gluten-free, others)?', dismissed: false },
    ],
    createdAt: iso,
    updatedAt: iso,
  };
}
