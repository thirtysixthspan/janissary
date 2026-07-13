import type { TimeOfDay } from '../types.js';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

export { MONTHS };

export function parseTimeOfDay(tok: string): TimeOfDay | undefined {
  // Anchored at both ends; bounded quantifiers only — not a ReDoS risk.
  // eslint-disable-next-line security/detect-unsafe-regex
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(tok.trim());
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap) {
    if (hour < 1 || hour > 12) return undefined;
    if (ap === 'pm' && hour !== 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return undefined;
  }
  if (minute > 59) return undefined;
  return { hour, minute };
}

export function parseInterval(tok: string): number | undefined {
  const m = /^(\d+)(m|h|d|w)$/i.exec(tok.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n <= 0) return undefined;
  return n * UNIT_MS[m[2].toLowerCase()];
}

export function parseMonthDay(tokens: string[]): { month: number; day: number; consumed: number } | undefined {
  const first = tokens[0];
  if (!first) return undefined;
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(first);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
    return { month, day, consumed: 1 };
  }
  const lc = first.toLowerCase();
  const month = lc.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(lc)) : -1;
  if (month < 0) return undefined;
  const dm = /^(\d{1,2})(?:st|nd|rd|th)?$/i.exec(tokens[1] ?? '');
  if (!dm) return undefined;
  const day = Number(dm[1]);
  if (day < 1 || day > 31) return undefined;
  return { month, day, consumed: 2 };
}
