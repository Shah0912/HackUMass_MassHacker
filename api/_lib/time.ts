// Time-zone helpers for reading a due date from the text ("due Sunday 5pm") in the user's local time.
// Plain Intl, no libraries. Pure: every function takes the instant it needs.

const safeZone = (timeZone: string | undefined): string => {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
};

/** Wall-clock parts of instant `t` in `timeZone`. */
function partsAt(t: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(new Date(t))) p[type] = value;
  return {
    weekday: p.weekday ?? '',
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

/** How far `timeZone` is ahead of UTC at instant `t`, in ms. */
function offsetMs(t: number, timeZone: string): number {
  const p = partsAt(t, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** "Saturday 2026-11-15 13:05" in the user's zone: what the model reads relative dates against. */
export function formatLocalNow(now: Date, timeZone: string | undefined): string {
  const p = partsAt(now.getTime(), safeZone(timeZone));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.weekday} ${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * Local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD", read as 23:59 that day) in `timeZone` → the UTC instant.
 * Returns null for anything malformed or for a date that does not exist (e.g. 2026-02-30).
 */
export function zonedLocalToUtc(local: string, timeZone: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi] = m[4] ? [Number(m[4]), Number(m[5])] : [23, 59];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;

  const zone = safeZone(timeZone);
  // Two passes so the offset is right on either side of a daylight-saving change.
  let t = wall - offsetMs(wall, zone);
  t = wall - offsetMs(t, zone);
  return new Date(t);
}
