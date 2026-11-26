import { nextFutureRun } from '../time.js';
import type { SystemScheduleEntry } from './types.js';

export function recoverSystemSchedules(entries: SystemScheduleEntry[], cutoff: number): {
  entries: SystemScheduleEntry[];
  missed: SystemScheduleEntry[];
} {
  const missed = entries.filter((entry) => !entry.paused && entry.nextRun <= cutoff);
  const missedKeys = new Set(missed.map((entry) => entry.key));
  const recovered = entries.flatMap((entry) => {
    if (entry.paused || !missedKeys.has(entry.key)) return [entry];
    if (!entry.recurring) return [];
    return [{ ...entry, nextRun: nextFutureRun(entry, new Date(cutoff)) }];
  });
  return { entries: recovered, missed };
}
