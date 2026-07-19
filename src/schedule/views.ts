import type { ScheduleEntry, Tab } from '../types.js';
import type { AggregatedScheduleView, ScheduleView } from '../protocol.js';
import { fmtNextRun } from './index.js';

// Pure view-shaping helpers extracted from ScheduleManager: turn the raw per-tab schedule map
// into the row shapes the client renders, with no dependency on PTY/command dispatch.

// The schedule rows for a tab's view: id, spec, humanized next-run time, and the recurring flag.
export function scheduleView(schedules: Map<string, ScheduleEntry[]>, label: string): ScheduleView[] {
  return (schedules.get(label) ?? []).map((e) => ({
    id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring,
  }));
}

// Every scheduled entry across all still-open tabs, flattened and sorted soonest-first by the raw
// next-run timestamp, then shaped like `scheduleView(label)` rows plus the owning tab label and
// command. Labels with no matching open tab are skipped, mirroring the open-tab guard in `tick()`.
export function aggregatedScheduleView(schedules: Map<string, ScheduleEntry[]>, tabs: Tab[]): AggregatedScheduleView[] {
  const rows: { entry: ScheduleEntry; label: string }[] = [];
  for (const [label, entries] of schedules) {
    if (tabs.every((t) => t.label !== label)) continue;
    for (const entry of entries) rows.push({ entry, label });
  }
  return rows
    .toSorted((a, b) => a.entry.nextRun - b.entry.nextRun)
    .map(({ entry: e, label }) => ({
      tab: label, id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring, command: e.command,
    }));
}
