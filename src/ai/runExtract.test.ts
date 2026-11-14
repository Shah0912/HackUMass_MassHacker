import { describe, expect, it } from 'vitest';
import { runExtract } from '@/ai/runExtract';

describe('runExtract', () => {
  it('rejects text over 30,000 chars with INPUT_TOO_LONG', async () => {
    const { status, body } = await runExtract(
      {
        text: 'x'.repeat(30_001),
        deadline: '2026-11-16T18:00:00-05:00',
        workHoursPerDay: 6,
        members: [{ name: 'Alex', hoursPerDay: 4 }],
      },
      { mockAi: true, apiKey: undefined },
    );
    expect(status).toBe(413);
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('INPUT_TOO_LONG');
  });

  it('rejects invalid bodies with INPUT_INVALID', async () => {
    const { status, body } = await runExtract(
      { text: 'hi' },
      { mockAi: true, apiKey: undefined },
    );
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('INPUT_INVALID');
  });

  it('returns fixture project when MOCK_AI is on', async () => {
    const { status, body } = await runExtract(
      {
        text: 'paste',
        deadline: '2026-11-20T18:00:00-05:00',
        workHoursPerDay: 6,
        members: [
          { name: 'Alex', hoursPerDay: 4 },
          { name: 'Jordan', hoursPerDay: 4 },
        ],
      },
      { mockAi: true, apiKey: undefined },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data.schemaVersion).toBe(1);
      expect(body.data.deadline).toBe('2026-11-20T18:00:00-05:00');
      expect(body.data.rawInput).toBe('paste');
      expect(body.data.tasks.length).toBeGreaterThan(5);
    }
  });
});
