// Flooring a date to a calendar unit, and saying which unit a span of dates is best read at.
//
// Bucketing a date column is a rewrite of the x cells and nothing else: the rows are all kept, so the
// rows of one month become the rows of one category and every stage downstream — the transformations, the
// `limit` that counts distinct categories, the client that groups rows sharing a label — behaves exactly
// as it does for a category the source happened to contain. The alternative, collapsing the rows here,
// would double-count: a sum of per-day sums is the right total but a mean of per-day means is not the
// mean the chart's own aggregate would have produced, and the client applies that aggregate after this.
//
// The floor is in UTC because a date cell in this feature is a calendar day and not an instant with a
// zone on it: `2026-03-01T09:00` is a moment, and it belongs to whichever month that moment is in, which
// without a zone is a question about the reader's clock that a stored chart has no way to record.

import { instantOf, isIsoDate } from './dates.js';
import type { Table } from './table.js';

// A closed list rather than a free unit, for the same reason the chart kinds are: a model that may say
// "fortnight" produces a chart nobody can read, and the list is what the prompt can print.
export const TIME_UNITS = ['year', 'quarter', 'month', 'week', 'day'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

export function isTimeUnit(value: unknown): value is TimeUnit {
  return typeof value === 'string' && (TIME_UNITS as readonly string[]).includes(value);
}

// The start of the unit an instant falls in, as an ISO date. A week starts on Monday, which is the ISO
// week: a bucket named after a Sunday would overlap nothing and would be a second, different calendar on
// the same axis.
export function startOf(instant: number, unit: TimeUnit): string {
  const at = new Date(instant);
  const year = at.getUTCFullYear();
  switch (unit) {
    case 'year': {
      return iso(year, 1, 1);
    }
    case 'quarter': {
      const firstMonth = Math.floor(at.getUTCMonth() / 3) * 3 + 1;
      return iso(year, firstMonth, 1);
    }
    case 'month': {
      return iso(year, at.getUTCMonth() + 1, 1);
    }
    case 'week': {
      const midnight = Date.UTC(year, at.getUTCMonth(), at.getUTCDate());
      // getUTCDay is 0 for Sunday, so the shift of one is what makes Monday the first day of a week.
      const sinceMonday = (at.getUTCDay() + 6) % 7;
      return isoDate(midnight - sinceMonday * 86_400_000);
    }
    case 'day': {
      return isoDate(Date.UTC(year, at.getUTCMonth(), at.getUTCDate()));
    }
    default: {
      return iso(year, 1, 1);
    }
  }
}

// The unit a span of dates reads best at, which is what the axis labels are chosen by. A year-wide chart
// labelled with a thousand day numbers is unreadable, and one year-long chart labelled with a single year
// is worse: the labels have to say how fine the axis actually is, and the span is the only thing that
// knows. The thresholds are powers of ten rather than calendar counts because a day is a day whether
// the month has 28 of them or 31.
export function unitFor(span: number): TimeUnit {
  const days = span / 86_400_000;
  if (days <= 70) return 'day';
  if (days <= 800) return 'month';
  return 'year';
}

// A date cell rewritten to the start of its unit, and the table it was in. A cell that is not a date is
// left exactly as it was: a source with a mixed column is already refused elsewhere, and rewriting half
// of it here would make the axis lie about the rows it kept.
export function bucketed(table: Table, column: string, unit: TimeUnit): Table {
  const at = table.columns.findIndex((one) => one.name === column);
  if (at === -1) return table;
  return {
    ...table,
    rows: table.rows.map((row) => {
      const cell = row[at];
      if (typeof cell !== 'string' || !isIsoDate(cell)) return row;
      const instant = instantOf(cell);
      if (!Number.isFinite(instant)) return row;
      const next = [...row];
      next[at] = startOf(instant, unit);
      return next;
    }),
  };
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isoDate(instant: number): string {
  const at = new Date(instant);
  return iso(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}
