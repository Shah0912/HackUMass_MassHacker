import { describe, expect, it } from 'vitest';
import { formatLocalNow, zonedLocalToUtc } from './time';

describe('zonedLocalToUtc', () => {
  it('converts local wall time in a zone to UTC, including daylight saving', () => {
    // New York is UTC-5 in November and UTC-4 in July.
    expect(zonedLocalToUtc('2026-11-22T12:00', 'America/New_York')!.toISOString()).toBe('2026-11-22T17:00:00.000Z');
    expect(zonedLocalToUtc('2026-07-04T09:30', 'America/New_York')!.toISOString()).toBe('2026-07-04T13:30:00.000Z');
    expect(zonedLocalToUtc('2026-11-22T12:00', 'Asia/Kolkata')!.toISOString()).toBe('2026-11-22T06:30:00.000Z');
  });

  it('reads a date with no time as 23:59 that day', () => {
    expect(zonedLocalToUtc('2026-11-22', 'UTC')!.toISOString()).toBe('2026-11-22T23:59:00.000Z');
  });

  it('falls back to UTC for an unknown zone and rejects bad dates', () => {
    expect(zonedLocalToUtc('2026-11-22T12:00', 'Not/AZone')!.toISOString()).toBe('2026-11-22T12:00:00.000Z');
    expect(zonedLocalToUtc('2026-02-30T12:00', 'UTC')).toBeNull();
    expect(zonedLocalToUtc('next Sunday', 'UTC')).toBeNull();
    expect(zonedLocalToUtc('2026-11-22T25:00', 'UTC')).toBeNull();
  });
});

describe('formatLocalNow', () => {
  it('shows weekday, date and time in the user zone', () => {
    const now = new Date('2026-11-15T06:05:00Z');
    expect(formatLocalNow(now, 'America/New_York')).toBe('Sunday 2026-11-15 01:05');
    expect(formatLocalNow(now, undefined)).toBe('Sunday 2026-11-15 06:05');
  });
});
