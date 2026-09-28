// How a date on the x axis is said. A tick for a month is a month's name and a tick for a year is the
// year, so the labels say how fine the axis is rather than printing the same ISO date two hundred times.
// The unit arrives with the chart, because the host floored the cells to it and a label that disagreed
// with the bucketing would be a chart whose axis and data describe different spans.

import type { VisualizationStack, VisualizationTimeUnit } from '@shared/plugins/visualizations/shared';

export type TimeUnit = VisualizationTimeUnit;

export type Stack = VisualizationStack;

export function calendarLabel(value: string, unit: TimeUnit): string {
  const at = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return value;
  const month = at.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  switch (unit) {
    case 'year': {
      return String(at.getUTCFullYear());
    }
    case 'quarter': {
      return `${month} Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
    }
    case 'month': {
      // A year-long chart of months needs the year on its first tick or the reader cannot tell which year
      // each band is in, which is the one thing a set of month names leaves out.
      return at.getUTCMonth() === 0 ? `${month} ${at.getUTCFullYear()}` : month;
    }
    case 'week':
    case 'day': {
      return `${month} ${at.getUTCDate()}`;
    }
    default: {
      return value;
    }
  }
}

