import type { ScheduleEntry } from './types.js';
import type { ScheduleView } from './protocol.js';
import { computeNextRun, fmtNextRun } from './schedule.js';
import type { Managers } from './managers.js';

// Owns the per-tab scheduled commands (keyed by tab label) and the 1-second firing loop: at each tick
// it fires any entry whose next-run time has passed, reschedules recurring ones, and drops one-shots.
// The controller owns the tabs and persistence; this module owns the schedule state and timing.
export class ScheduleManager {
  private schedules = new Map<string, ScheduleEntry[]>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private managers: Managers) {}

  // Begin the firing loop. `unref` so a pending tick never keeps the process alive on its own.
  start(): void {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }

  // Stop the firing loop (app shutdown).
  stop(): void {
    clearInterval(this.timer);
  }

  // A tab's scheduled commands, or undefined when it has none (raw — for persistence and the command
  // context, both of which distinguish "no schedule" from "empty schedule").
  get(label: string): ScheduleEntry[] | undefined {
    return this.schedules.get(label);
  }

  // Replace a tab's scheduled commands. Persisting is the caller's concern (rehydrate/profile load
  // restore without re-persisting; the `schedule` command persists separately).
  set(label: string, entries: ScheduleEntry[]): void {
    this.schedules.set(label, entries);
  }

  // Forget a tab's schedule (on tab close).
  delete(label: string): void {
    this.schedules.delete(label);
  }

  // The schedule rows for a tab's view: id, spec, humanized next-run time, and the recurring flag.
  view(label: string): ScheduleView[] {
    return (this.schedules.get(label) ?? []).map((e) => ({
      id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring,
    }));
  }

  // Fire any commands whose next-run time has passed, in every still-open tab. A recurring entry is
  // rescheduled to its next run; a one-shot drops off. Tabs whose schedule changed are persisted.
  private tick(): void {
    const now = Date.now();
    for (const label of this.managers.tab.allLabels()) {
      const sched = this.schedules.get(label);
      if (!sched || sched.length === 0) continue;
      let isChanged = false;
      const remaining: ScheduleEntry[] = [];
      for (const e of sched) {
        if (e.nextRun > now) { remaining.push(e); continue; }
        isChanged = true;
        this.managers.command.dispatchTo(label, `${e.command} ## scheduled ##`);
        if (e.recurring) remaining.push({ ...e, nextRun: computeNextRun(e, new Date()) });
      }
      if (isChanged) {
        this.schedules.set(label, remaining);
        const tab = this.managers.tab.tabs.find((t) => t.label === label);
        if (tab) this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: this.get(tab.label) }));
      }
    }
  }
}
