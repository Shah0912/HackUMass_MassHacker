import { describe, expect, it } from 'vitest';
import { analyse } from '@/core/analyse';
import { NOW, member, project, task } from '@/core/testUtils';

describe('analyse', () => {
  it('schedules a linear chain', () => {
    const result = analyse(
      project({
        tasks: [
          task('t1', { estimateHours: 2, dependsOn: [] }),
          task('t2', { estimateHours: 3, dependsOn: ['t1'] }),
          task('t3', { estimateHours: 4, dependsOn: ['t2'] }),
        ],
        deadline: '2026-11-16T12:00:00.000Z', // 2 days × 6 = 12h
        workHoursPerDay: 6,
      }),
      NOW,
    );

    expect(result.valid).toBe(true);
    expect(result.order).toEqual(['t1', 't2', 't3']);
    expect(result.durationHours).toBe(9);
    expect(result.criticalPath).toEqual(['t1', 't2', 't3']);
    expect(result.tasks.t1?.isCritical).toBe(true);
    expect(result.tasks.t2?.earliestStart).toBe(2);
    expect(result.tasks.t3?.earliestFinish).toBe(9);
    expect(result.availableHours).toBe(12);
    expect(result.bufferHours).toBe(3);
    expect(result.verdict).toBe('on_track');
  });

  it('schedules a diamond with parallel branches', () => {
    const result = analyse(
      project({
        tasks: [
          task('tA', { estimateHours: 2, dependsOn: [] }),
          task('tB', { estimateHours: 5, dependsOn: ['tA'] }),
          task('tC', { estimateHours: 3, dependsOn: ['tA'] }),
          task('tD', { estimateHours: 2, dependsOn: ['tB', 'tC'] }),
        ],
      }),
      NOW,
    );

    expect(result.valid).toBe(true);
    expect(result.durationHours).toBe(9); // A2 + B5 + D2
    expect(result.criticalPath).toEqual(['tA', 'tB', 'tD']);
    expect(result.tasks.tC?.slackHours).toBe(2);
    expect(result.tasks.tB?.isCritical).toBe(true);
    expect(result.tasks.tC?.isCritical).toBe(false);
  });

  it('returns invalid analysis for a cycle', () => {
    const result = analyse(
      project({
        tasks: [
          task('t1', { dependsOn: ['t2'] }),
          task('t2', { dependsOn: ['t1'] }),
        ],
      }),
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CYCLE')).toBe(true);
    expect(result.order).toEqual([]);
    expect(result.risks).toEqual([]);
  });

  it('returns invalid analysis for duplicate ids', () => {
    const result = analyse(
      project({
        tasks: [task('t1'), task('t1', { title: 'Dup' })],
      }),
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('picks bottleneck by downstream count, then critical path, then lowest id', () => {
    // t1 and t2 both have 2 unfinished downstream; only t1 is on the longer critical path.
    // Structure:
    //   t1 (2h) → t3 (2h) → t5 (2h)
    //   t2 (2h) → t4 (2h) → t5
    //   t0 (1h) alone
    // Downstream unfinished: t1→{t3,t5}=2, t2→{t4,t5}=2. Critical path includes t1 (tie-break).
    const result = analyse(
      project({
        tasks: [
          task('t0', { estimateHours: 1, dependsOn: [] }),
          task('t1', { estimateHours: 2, dependsOn: [] }),
          task('t2', { estimateHours: 2, dependsOn: [] }),
          task('t3', { estimateHours: 2, dependsOn: ['t1'] }),
          task('t4', { estimateHours: 2, dependsOn: ['t2'] }),
          task('t5', { estimateHours: 2, dependsOn: ['t3', 't4'] }),
        ],
        deadline: '2026-11-15T12:00:00.000Z',
      }),
      NOW,
    );

    expect(result.tasks.t1?.downstreamCount).toBe(2);
    expect(result.tasks.t2?.downstreamCount).toBe(2);
    expect(result.criticalPath).toContain('t1');
    // Same downstream count; critical path wins — both may be on crit depending on walk.
    // If both on path or neither exclusive: lowest id among tied count on crit.
    expect(result.bottleneckTaskId).toBe('t1');
  });

  it('uses lowest id when downstream and critical-path ties', () => {
    // Two identical parallel starters into one sink; same downstream (1).
    // Critical path walk-back from sink: deps finish at same time → lowest id (t1).
    const result = analyse(
      project({
        tasks: [
          task('t1', { estimateHours: 3, dependsOn: [] }),
          task('t2', { estimateHours: 3, dependsOn: [] }),
          task('t3', { estimateHours: 1, dependsOn: ['t1', 't2'] }),
        ],
      }),
      NOW,
    );
    expect(result.tasks.t1?.downstreamCount).toBe(1);
    expect(result.tasks.t2?.downstreamCount).toBe(1);
    expect(result.bottleneckTaskId).toBe('t1');
  });

  it('returns null bottleneck when nothing blocks unfinished work', () => {
    const result = analyse(
      project({
        tasks: [
          task('t1', { estimateHours: 2, dependsOn: [] }),
          task('t2', { estimateHours: 2, dependsOn: [] }),
        ],
      }),
      NOW,
    );
    expect(result.bottleneckTaskId).toBeNull();
  });

  it('marks late verdict and late risk when buffer is negative', () => {
    const result = analyse(
      project({
        tasks: [
          task('t1', { estimateHours: 10, dependsOn: [] }),
          task('t2', { estimateHours: 10, dependsOn: ['t1'] }),
        ],
        deadline: '2026-11-15T12:00:00.000Z', // 1 day × 6 = 6h available
        workHoursPerDay: 6,
      }),
      NOW,
    );
    expect(result.verdict).toBe('late');
    expect(result.bufferHours).toBeLessThan(0);
    expect(result.risks.some((r) => r.kind === 'late')).toBe(true);
  });

  it('computes member load overload', () => {
    const result = analyse(
      project({
        members: [member('m1', 'Alex', 2), member('m2', 'Jordan', 8)],
        tasks: [
          task('t1', { ownerId: 'm1', estimateHours: 8, dependsOn: [] }),
          task('t2', { ownerId: 'm2', estimateHours: 1, dependsOn: [] }),
        ],
        deadline: '2026-11-15T12:00:00.000Z', // 1 day
        workHoursPerDay: 6,
      }),
      NOW,
    );
    expect(result.members.m1!.loadRatio).toBeGreaterThan(1);
    expect(result.risks.some((r) => r.kind === 'person_overload')).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const p = project({
      tasks: [
        task('tB', { estimateHours: 2, dependsOn: [] }),
        task('tA', { estimateHours: 2, dependsOn: [] }),
        task('tC', { estimateHours: 2, dependsOn: ['tA', 'tB'] }),
      ],
    });
    const a = analyse(p, NOW);
    const b = analyse(p, NOW);
    expect(a).toEqual(b);
    expect(a.order[0]).toBe('tA'); // tie-break lowest id among ready
  });

  it('halves remaining hours for in_progress tasks', () => {
    const result = analyse(
      project({
        tasks: [task('t1', { estimateHours: 4, status: 'in_progress' })],
      }),
      NOW,
    );
    expect(result.tasks.t1?.remainingHours).toBe(2);
    expect(result.durationHours).toBe(2);
  });
});
