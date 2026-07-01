import type { ScheduleEntry, Tab } from './types.js';
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
  // rescheduled to its next run; a one-shot drops off. Tabs whose schedule changed are persisted
  // (harness tabs excepted — they have no persisted agent state).
  private tick(): void {
    const now = Date.now();
    for (const label of this.managers.tab.allLabels()) {
      const tab = this.managers.tab.tabs.find((t) => t.label === label);
      const sched = this.schedules.get(label);
      if (!tab || !sched || sched.length === 0) continue;
      const remaining = this.fireDue(tab, sched, now);
      if (!remaining) continue;
      this.schedules.set(label, remaining);
      if (tab.view !== 'harness') this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: this.get(label) }));
    }
  }

  // Fire one tab's due entries, returning the surviving schedule (recurring entries rescheduled,
  // one-shots dropped), or undefined when nothing fired.
  private fireDue(tab: Tab, sched: ScheduleEntry[], now: number): ScheduleEntry[] | undefined {
    let isChanged = false;
    const remaining: ScheduleEntry[] = [];
    for (const e of sched) {
      if (e.nextRun > now || !this.fire(tab, e)) { remaining.push(e); continue; }
      isChanged = true;
      if (e.recurring) remaining.push({ ...e, nextRun: computeNextRun(e, new Date()) });
    }
    return isChanged ? remaining : undefined;
  }

  // Deliver a due entry to its tab: typed into a harness PTY as a line of input, or dispatched
  // through an agent tab's command pipeline. Returns false when delivery must wait (the harness
  // is not running), leaving the entry due so it retries on a later tick.
  private fire(tab: Tab, e: ScheduleEntry): boolean {
    if (tab.view === 'harness') {
      if (tab.harness?.status !== 'running' || !tab.harness.ptyId) return false;
      this.managers.pty.input(tab.harness.ptyId, `${e.command}\r`);
      return true;
    }
    this.managers.command.dispatchTo(tab.label, `${e.command} ## scheduled ##`);
    return true;
  }
}
