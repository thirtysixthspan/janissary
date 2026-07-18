import type { ScheduleEntry, Tab } from '../types.js';
import type { AggregatedScheduleView, ScheduleLaunchView, ScheduleView } from '../protocol.js';
import { computeNextRun, fmtNextRun } from './index.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';

// Owns the per-tab scheduled commands (keyed by tab label) and the 1-second firing loop: at each tick
// it fires any entry whose next-run time has passed, reschedules recurring ones, and drops one-shots.
// The controller owns the tabs and persistence; this module owns the schedule state and timing.
export class ScheduleManager {
  private schedules = new Map<string, ScheduleEntry[]>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private launchDialogOpen = false;
  constructor(private managers: Managers) {}

  // Open the "New schedule" dialog (bare `schedule`). Held as a flag, mirroring
  // `HarnessManager.openLaunchDialog`; surfaced to the client via `scheduleLaunchView()`.
  openScheduleLaunch(): void {
    this.launchDialogOpen = true;
    messageBus.emit('state', { type: 'dirty' });
  }

  // Close the launch dialog (Cancel/Escape, or once a schedule has been submitted).
  closeScheduleLaunch(): void {
    this.launchDialogOpen = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  // The launch dialog's target-tab catalog while open, or null when closed: the eligible tab
  // labels (agent + harness tabs, the same predicate `resolveTargetTab` uses) plus the active
  // tab's label as the default.
  scheduleLaunchView(): ScheduleLaunchView | null {
    if (!this.launchDialogOpen) return null;
    const eligible = new Set<Tab['view'] | undefined>([undefined, 'agent', 'harness']);
    const targets = this.managers.tab.tabs
      .filter((t) => eligible.has(t.view))
      .map((t) => t.label);
    return { targets, active: this.managers.tab.cur().label };
  }

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

  // Remove one entry from a tab's schedule by id, after the client has confirmed the deletion.
  // Persists the reduced list for non-harness tabs and re-emits state so every schedule surface
  // refreshes. Returns false (no persist, no emit) when the tab has no matching entry.
  cancel(label: string, id: string): boolean {
    const current = this.schedules.get(label) ?? [];
    const next = current.filter((e) => e.id !== id);
    if (next.length === current.length) return false;
    this.schedules.set(label, next);
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (tab && tab.view !== 'harness') this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: next }));
    messageBus.emit('state', { type: 'dirty' });
    return true;
  }

  // The schedule rows for a tab's view: id, spec, humanized next-run time, and the recurring flag.
  view(label: string): ScheduleView[] {
    return (this.schedules.get(label) ?? []).map((e) => ({
      id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring,
    }));
  }

  // Every scheduled entry across all still-open tabs, flattened and sorted soonest-first by the raw
  // next-run timestamp, then shaped like `view(label)` rows plus the owning tab label and command.
  // Labels with no matching open tab are skipped, mirroring the open-tab guard in `tick()`.
  aggregatedView(): AggregatedScheduleView[] {
    const rows: { entry: ScheduleEntry; label: string }[] = [];
    for (const [label, entries] of this.schedules) {
      if (this.managers.tab.tabs.every((t) => t.label !== label)) continue;
      for (const entry of entries) rows.push({ entry, label });
    }
    return rows
      .toSorted((a, b) => a.entry.nextRun - b.entry.nextRun)
      .map(({ entry: e, label }) => ({
        tab: label, id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring, command: e.command,
      }));
  }

  // Fire any commands whose next-run time has passed, in every still-open tab. A recurring entry is
  // rescheduled to its next run; a one-shot drops off. Tabs whose schedule changed are persisted
  // (harness tabs excepted — they have no persisted agent state).
  private tick(): void {
    const now = Date.now();
    let changed = false;
    for (const label of this.managers.tab.allLabels()) {
      const tab = this.managers.tab.tabs.find((t) => t.label === label);
      const sched = this.schedules.get(label);
      if (!tab || !sched || sched.length === 0) continue;
      const remaining = this.fireDue(tab, sched, now);
      if (!remaining) continue;
      this.schedules.set(label, remaining);
      changed = true;
      if (tab.view !== 'harness') this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: this.get(label) }));
    }
    if (changed) messageBus.emit('state', { type: 'dirty' });
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
      // Sent as one write, a long command's trailing \r can land inside the same burst the harness's
      // own input parser treats as a paste, so it's read as inserted text rather than submit. Splitting
      // the \r into its own write after the text has been processed mimics organic typing and avoids that.
      const ptyId = tab.harness.ptyId;
      this.managers.pty.input(ptyId, e.command);
      setTimeout(() => this.managers.pty.input(ptyId, '\r'), 50);
      notify(this.managers, 'schedule-fire', tab.label, e.command);
      return true;
    }
    this.managers.command.dispatchTo(tab.label, `${e.command} ## scheduled ##`);
    notify(this.managers, 'schedule-fire', tab.label, e.command);
    return true;
  }
}
