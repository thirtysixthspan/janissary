import { computeNextRun } from '../time.js';
import type { SystemScheduleEntry } from './types.js';

export function recoverSystemSchedules(entries: SystemScheduleEntry[], cutoff: number): {
  entries: SystemScheduleEntry[];
  missed: SystemScheduleEntry[];
} {
  const missed = entries.filter((entry) => entry.nextRun <= cutoff);
  const missedKeys = new Set(missed.map((entry) => entry.key));
  const recovered = entries.flatMap((entry) => {
    if (!missedKeys.has(entry.key)) return [entry];
    if (!entry.recurring) return [];
    let nextRun = computeNextRun(entry, new Date(cutoff));
    while (nextRun <= cutoff) nextRun = computeNextRun(entry, new Date(nextRun));
    return [{ ...entry, nextRun }];
  });
  return { entries: recovered, missed };
}
