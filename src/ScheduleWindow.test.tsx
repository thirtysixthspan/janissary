import { describe, it, expect } from 'vitest';
import { scheduleLines } from './ScheduleWindow.js';
import { darkTheme } from './theme.js';
import type { ScheduleEntry } from './types.js';

const NOW = new Date(2026, 5, 23, 14, 0, 0, 0).getTime();

const entry = (over: Partial<ScheduleEntry>): ScheduleEntry => ({
  id: 's1', command: 'echo hi', spec: 'every 5m', nextRun: NOW, recurring: true, ...over,
});

describe('scheduleLines', () => {
  it('lists each timer with id, spec, and next run', () => {
    const lines = scheduleLines(
      [entry({ id: 'deploy', spec: 'at 3:35pm', recurring: false, nextRun: new Date(2026, 5, 23, 15, 35).getTime() })],
      darkTheme,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('deploy  at 3:35pm  (next: Jun 23 3:35pm)');
  });

  it('colors recurring timers with the accent and one-shots with the foreground', () => {
    const lines = scheduleLines(
      [entry({ id: 's1', recurring: true }), entry({ id: 's2', recurring: false })],
      darkTheme,
    );
    expect(lines[0].color).toBe(darkTheme.accent);
    expect(lines[1].color).toBe(darkTheme.fg);
  });

  it('returns no lines for an empty schedule', () => {
    expect(scheduleLines([], darkTheme)).toEqual([]);
  });
});
