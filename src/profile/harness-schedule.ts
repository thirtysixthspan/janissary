import { parseScheduleCommand } from '../schedule/index.js';
import type { ProfileHarnessEntry, ScheduleEntry } from '../types.js';

// A one-shot schedule entry that fires `command` once, immediately (as soon as the tab's harness is
// running). This is the shape a profile `run` line produces, reused to inject a `harness … with …`
// launch prompt into a freshly opened harness tab.
export function oneShotRunEntry(id: string, command: string): ScheduleEntry {
  return { id, command, spec: 'once', nextRun: Date.now(), recurring: false };
}

// Authored `schedule` strings (schedule-command grammar minus `in <tab>`) plus `run` one-shots,
// parsed into the ScheduleEntry[] the harness tab's schedule is set to. A string that errors or
// carries an `in <tab>` clause is reported and skipped; a duplicate name keeps the first.
export function buildHarnessSchedule(entry: ProfileHarnessEntry, report: (message: string) => void): ScheduleEntry[] {
  const now = new Date();
  const entries: ScheduleEntry[] = [];
  const ids = new Set<string>();
  const scheduleLines = entry.schedule ?? [];
  for (const raw of scheduleLines) {
    const parsed = parseScheduleCommand(raw, now);
    if ('error' in parsed) { report(`Schedule "${raw}" for "${entry.name}": ${parsed.error}`); continue; }
    if (parsed.action !== 'add') { report(`Schedule "${raw}" for "${entry.name}" is not a new schedule.`); continue; }
    if (parsed.target !== undefined) { report(`Schedule "${raw}" for "${entry.name}" cannot target another tab.`); continue; }
    if (ids.has(parsed.name)) { report(`Duplicate schedule name "${parsed.name}" for "${entry.name}"; kept the first.`); continue; }
    ids.add(parsed.name);
    entries.push({ ...parsed.entry, id: parsed.name });
  }
  const runLines = entry.run ?? [];
  for (const [i, command] of runLines.entries()) {
    entries.push(oneShotRunEntry(`run-${i + 1}`, command));
  }
  return entries;
}
