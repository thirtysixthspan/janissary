import { describe, expect, it } from 'vitest';
import { recoverSystemSchedules } from './boot-recovery.js';
import type { SystemScheduleEntry } from './types.js';

const entry = (overrides: Partial<SystemScheduleEntry> = {}): SystemScheduleEntry => ({
  key: 'key', id: 'daily', script: 'build', command: 'script build', spec: 'every day',
  nextRun: 100, recurring: true, timeOfDay: { hour: 9, minute: 0 }, ...overrides,
});

describe('recoverSystemSchedules', () => {
  it('treats the exact cutoff as missed, removes one-shots, and advances recurrence beyond it', () => {
    const oneShot = entry({ key: 'once', id: 'once', recurring: false, nextRun: 100, timeOfDay: undefined });
    const recurring = entry({ key: 'daily', nextRun: 100 });
    const future = entry({ key: 'future', nextRun: 101 });
    const result = recoverSystemSchedules([oneShot, recurring, future], 100);

    expect(result.missed).toEqual([oneShot, recurring]);
    expect(result.entries).toEqual([expect.objectContaining({ key: 'daily', nextRun: expect.any(Number) }), future]);
    expect(result.entries[0].nextRun).toBeGreaterThan(100);
  });

  it('skips repeated missed interval occurrences in one recovery', () => {
    const interval = entry({ intervalMs: 60, timeOfDay: undefined, nextRun: 100 });
    const result = recoverSystemSchedules([interval], 10_000);
    expect(result.missed).toEqual([interval]);
    expect(result.entries[0].nextRun).toBeGreaterThan(10_000);
  });

  it('recovers duplicate display names independently by immutable key', () => {
    const once = entry({ key: 'once-key', id: 'same', recurring: false, timeOfDay: undefined, nextRun: 100 });
    const recurring = entry({ key: 'daily-key', id: 'same', nextRun: 100 });

    const result = recoverSystemSchedules([once, recurring], 100);

    expect(result.missed).toEqual([once, recurring]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ key: 'daily-key', id: 'same', recurring: true });
    expect(result.entries[0].nextRun).toBeGreaterThan(100);
  });
});
