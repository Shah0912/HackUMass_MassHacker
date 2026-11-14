/** Frozen at MVP M0. Change only with a BUILD_MVP.md / spec edit and a note to P1–P3. */

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Confidence = 'high' | 'medium' | 'low';
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

export type RiskSeverity = 'high' | 'medium' | 'low';

export type ValidationCode =
  | 'DUPLICATE_ID'
  | 'UNKNOWN_DEPENDENCY'
  | 'SELF_DEPENDENCY'
  | 'CYCLE'
  | 'UNKNOWN_OWNER'
  | 'BAD_ESTIMATE'
  | 'EMPTY_TITLE'
  | 'TOO_MANY_TASKS'
  | 'NO_OWNER'
  | 'ORPHAN_TASK';

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
  /** Post-MVP. Unused in MVP. */
  cut?: boolean;
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
  /** Kept for schema compatibility; MVP does not surface open questions. */
  openQuestions: OpenQuestion[];
  createdAt: string;
  updatedAt: string;
}

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

export interface Risk {
  id: string; // kind + main task or member id
  kind: RiskKind;
  severity: RiskSeverity;
  title: string;
  detail: string;
  taskIds: string[];
  memberIds: string[];
  /** Post-MVP. Omitted from MVP analyse() output. */
  suggestion?: {
    kind: 'reassign' | 'cut' | 'start_now' | 'confirm' | 'assign';
    taskId: string;
    toMemberId?: string;
    bufferGainHours?: number;
    text: string;
  };
}

export interface ValidationIssue {
  code: ValidationCode | string;
  level: 'error' | 'warning';
  taskIds: string[];
  message: string;
}

/** Derived by analyse(project, now). Never stored. */
export interface Analysis {
  valid: boolean; // false → only `issues` is filled
  issues: ValidationIssue[];
  order: string[]; // topological order
  criticalPath: string[];
  durationHours: number; // critical path length in remaining hours
  availableHours: number;
  bufferHours: number; // available − duration
  verdict: Verdict;
  tasks: Record<string, TaskMetrics>;
  members: Record<string, MemberMetrics>;
  /** MVP: unfinished task with most unfinished downstream (see BUILD_MVP.md). */
  bottleneckTaskId: string | null;
  risks: Risk[]; // computed inside analyse(), max 3 for MVP
}
