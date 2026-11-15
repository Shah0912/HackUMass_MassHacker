// Shared contracts (spec: Data requirements). Frozen at M0: change only with a note to everyone.

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Confidence = 'high' | 'medium' | 'low';

export interface Member {
  id: string; // "m1", "m2"
  name: string;
  hoursPerDay: number; // default 4
  color: string; // from a fixed palette by index
}

export interface Task {
  id: string; // "t1"; stable for the life of the project
  title: string; // 3 to 80 chars, starts with a verb
  description?: string;
  ownerId: string | null;
  estimateHours: number; // 0.25 to 80
  status: TaskStatus;
  dependsOn: string[]; // tasks that must finish first
  source: 'ai' | 'user';
  confidence?: Confidence; // only when source is 'ai'
  estimateInferred?: boolean; // text gave no estimate
  evidence?: string; // quote from raw text, max 160 chars
  cut?: boolean; // removed from scope, kept for undo
}

export interface OpenQuestion {
  id: string;
  taskId: string | null;
  field: 'owner' | 'estimate' | 'dependency' | 'scope' | 'status';
  question: string;
  dismissed: boolean;
}

export interface Project {
  schemaVersion: 1;
  id: string; // uuid
  name: string;
  deadline: string; // ISO 8601 with offset
  workHoursPerDay: number; // default 6
  members: Member[];
  tasks: Task[];
  rawInput: string; // never included in share links
  openQuestions: OpenQuestion[];
  createdAt: string;
  updatedAt: string;
}

// ---- Derived (computed by analyse(project, now); never stored) ----

export interface TaskMetrics {
  taskId: string;
  remainingHours: number;
  earliestStart: number;
  earliestFinish: number; // hours from now
  latestStart: number;
  latestFinish: number;
  slackHours: number;
  isCritical: boolean;
  downstreamCount: number; // unfinished tasks that transitively depend on it
}

export interface MemberMetrics {
  memberId: string;
  openTaskCount: number;
  remainingHours: number;
  criticalHours: number;
  capacityHours: number;
  loadRatio: number; // remaining / capacity; 99 when capacity is 0
}

export type Verdict = 'late' | 'at_risk' | 'on_track';

export type RiskKind =
  | 'late'
  | 'thin_buffer'
  | 'person_overload'
  | 'critical_concentration'
  | 'task_bottleneck'
  | 'unassigned'
  | 'blocked'
  | 'shaky_estimates';

export interface Risk {
  id: string; // kind + main task or member id
  kind: RiskKind;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  taskIds: string[];
  memberIds: string[];
  suggestion?: {
    kind: 'reassign' | 'cut' | 'start_now' | 'confirm' | 'assign';
    taskId: string;
    toMemberId?: string;
    bufferGainHours?: number; // computed by re-running analysis
    text: string;
  };
}

export interface ValidationIssue {
  code: string;
  level: 'error' | 'warning';
  taskIds: string[];
  message: string;
}

export interface Analysis {
  valid: boolean; // false when any error exists; other fields then empty
  issues: ValidationIssue[];
  order: string[]; // topological order
  criticalPath: string[];
  durationHours: number;
  availableHours: number;
  bufferHours: number;
  verdict: Verdict;
  tasks: Record<string, TaskMetrics>;
  members: Record<string, MemberMetrics>;
  bottleneckTaskId: string | null; // MVP addition
  risks: Risk[];
}

export const LIMITS = { maxTasks: 150, maxMembers: 12, maxChars: 30_000 } as const;

export const MEMBER_COLORS = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#65a30d',
  '#4f46e5',
  '#c026d3',
  '#0d9488',
  '#ea580c',
] as const;

export const memberColor = (index: number): string => MEMBER_COLORS[index % MEMBER_COLORS.length]!;
