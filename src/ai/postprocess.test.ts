import { describe, expect, it } from 'vitest';
import { clampEstimate, modelOutputToProject, namesMatch } from '@/ai/postprocess';
import type { ExtractModelOutput } from '@/ai/contracts';

describe('postprocess', () => {
  it('clamps and rounds estimates to 0.25', () => {
    expect(clampEstimate(0.1)).toBe(0.25);
    expect(clampEstimate(100)).toBe(80);
    expect(clampEstimate(1.1)).toBe(1);
    expect(clampEstimate(1.2)).toBe(1.25);
  });

  it('matches owners case-insensitively by first name', () => {
    expect(namesMatch('Alex', 'alex')).toBe(true);
    expect(namesMatch('Alex Kim', 'alex')).toBe(true);
    expect(namesMatch('Jordan', 'Sam')).toBe(false);
  });

  it('maps keys to t1.. and drops unknown deps; unknown owners become null', () => {
    const output: ExtractModelOutput = {
      projectName: 'Demo',
      members: [{ name: 'Alex', hoursPerDay: 4 }],
      tasks: [
        {
          key: 'schema',
          title: 'Design DB schema',
          ownerName: 'Alex',
          estimateHours: 4,
          estimateInferred: false,
          status: 'todo',
          dependsOnKeys: [],
          evidence: 'Alex will lock schema',
          confidence: 'high',
        },
        {
          key: 'auth',
          title: 'Set up auth',
          ownerName: 'Nobody',
          estimateHours: 3,
          estimateInferred: true,
          status: 'todo',
          dependsOnKeys: ['schema', 'missing'],
          evidence: 'auth after schema',
          confidence: 'medium',
        },
      ],
    };

    const project = modelOutputToProject(output, {
      text: 'chat',
      deadline: '2026-11-16T18:00:00-05:00',
      workHoursPerDay: 6,
      members: [
        { name: 'Alex', hoursPerDay: 4 },
        { name: 'Jordan', hoursPerDay: 4 },
      ],
    });

    expect(project.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(project.tasks[0]!.ownerId).toBe('m1');
    expect(project.tasks[1]!.ownerId).toBeNull();
    expect(project.tasks[1]!.dependsOn).toEqual(['t1']);
    expect(project.tasks[1]!.source).toBe('ai');
    expect(project.members).toHaveLength(2);
    expect(project.openQuestions).toEqual([]);
  });
});
