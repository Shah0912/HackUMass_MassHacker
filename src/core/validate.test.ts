import { describe, expect, it } from 'vitest';
import { project, task } from '@/core/testUtils';
import { validate } from '@/core/validate';

describe('validate', () => {
  it('accepts a linear graph', () => {
    const issues = validate(
      project({
        tasks: [
          task('t1', { dependsOn: [] }),
          task('t2', { dependsOn: ['t1'] }),
          task('t3', { dependsOn: ['t2'] }),
        ],
      }),
    );
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('flags DUPLICATE_ID', () => {
    const issues = validate(
      project({
        tasks: [task('t1'), task('t1', { title: 'Other' })],
      }),
    );
    expect(issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('flags UNKNOWN_DEPENDENCY', () => {
    const issues = validate(
      project({
        tasks: [task('t1', { dependsOn: ['missing'] })],
      }),
    );
    expect(issues.some((i) => i.code === 'UNKNOWN_DEPENDENCY')).toBe(true);
  });

  it('flags SELF_DEPENDENCY', () => {
    const issues = validate(
      project({
        tasks: [task('t1', { dependsOn: ['t1'] })],
      }),
    );
    expect(issues.some((i) => i.code === 'SELF_DEPENDENCY')).toBe(true);
  });

  it('flags CYCLE with task ids in loop order', () => {
    // A → B → C → A (each depends on the next)
    const issues = validate(
      project({
        tasks: [
          task('tA', { dependsOn: ['tB'] }),
          task('tB', { dependsOn: ['tC'] }),
          task('tC', { dependsOn: ['tA'] }),
        ],
      }),
    );
    const cycle = issues.find((i) => i.code === 'CYCLE');
    expect(cycle).toBeDefined();
    expect(cycle!.taskIds).toEqual(['tA', 'tB', 'tC']);
  });

  it('does not flag unknown owners', () => {
    const issues = validate(
      project({
        tasks: [task('t1', { ownerId: 'nope' })],
      }),
    );
    expect(issues.some((i) => i.code === 'UNKNOWN_OWNER')).toBe(false);
  });
});
