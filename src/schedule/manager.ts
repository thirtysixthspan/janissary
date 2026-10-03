import type { ScheduleEntry } from './types.js';
import type { Tab } from '../tab/types.js';
import type { AggregatedScheduleView, ScheduleLaunchView, ScheduleView } from '../protocol.js';
import { computeNextRun } from './time.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { scheduleView, aggregatedScheduleView } from './views.js';
import { formatLateDuration } from './display.js';
import { typeIntoHarness } from '../harness/input.js';

// Independent of `resume-watch.ts`'s own threshold for "the machine was asleep": this one is the
// user-visible lateness bar `product/specs/scheduling.md` documents as five seconds, and it stays
// five seconds regardless of what wall-clock gap counts as a resume.
const SCHEDULE_LATE_THRESHOLD_MS = 5000;

// What a caller that appended an entry through `add` wants told about its fate: `fired` once the
// entry has been delivered, `removed` when it leaves the schedule any other way. Both are optional
// and both are reported at most once.
type EntryHooks = { fired?: () => void; removed?: () => void };

// Owns the per-tab scheduled commands (keyed by tab label) and the 1-second firing loop: at each tick
// it fires any entry whose next-run time has passed, reschedules recurring ones, and drops one-shots.
// The controller owns the tabs and persistence; this module owns the schedule state and timing.
export class ScheduleManager {
  private schedules = new Map<string, ScheduleEntry[]>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private launchDialogOpen = false;
  // The wall-clock instant of the most recent resume, so a late entry is blamed on sleep only when
  // it was already overdue at that moment — not whenever any resume has ever happened.
  private lastResume = 0;
  private resumeSubscription = messageBus.on('system', 'resumed', () => { this.lastResume = Date.now(); });
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

  // The per-entry hooks a caller registered through `add`, keyed by tab and then entry id. Two
  // maps rather than one joined key, so no label can be mistaken for part of an id — a profile
  // harness entry's name may contain a space, and `codex team 2` must not read as an entry called
  // `2 …` on `codex team`. Held apart from the entries themselves because a caller-supplied
  // callback has no business on a type agent tabs persist.
  private hooks = new Map<string, Map<string, EntryHooks>>();

  // Begin the firing loop. `unref` so a pending tick never keeps the process alive on its own.
  start(): void {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }

  // Stop the firing loop (app shutdown).
  stop(): void {
    clearInterval(this.timer);
    this.resumeSubscription.unsubscribe();
  }

  dispose(): void {
    this.stop();
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
    this.announceChange();
  }

  // Add one entry to a tab's schedule, replacing any entry carrying the same id. The two hooks are
  // how a caller that appends an entry learns what became of it without owning a timer of its own:
  // `onFired` runs once the entry has actually been delivered, and never on a tick where delivery had
  // to wait — a retry is not a firing — while `onRemoved` runs when the entry leaves the schedule any
  // other way, the user cancelling it or the tab closing. Hooks are held beside the entry rather than
  // on `ScheduleEntry`, which agent tabs persist. For a harness tab: an entry the app appends itself
  // lands in a schedule the user also owns, and this appends to it rather than replacing it. An
  // agent tab's schedule is written to its state file here, as `tick` and the `schedule` command do.
  add(label: string, entry: ScheduleEntry, hooks?: EntryHooks): void {
    const current = this.schedules.get(label) ?? [];
    const next = [...current.filter((e) => e.id !== entry.id), entry];
    this.schedules.set(label, next);
    this.forgetHook(label, entry.id);
    if (hooks) this.entryHooks(label, entry.id, hooks);
    this.persist(label, next);
    this.announceChange();
    messageBus.emit('state', { type: 'dirty' });
  }

  // Write a tab's schedule into its state file, for the tabs whose schedules outlive the process.
  // `TabManager.persist` writes agent tabs only, so a harness tab's — memory-only by design — is
  // simply not written, and a closed tab's label resolves to nothing and is skipped.
  private persist(label: string, entries: ScheduleEntry[]): void {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) return;
    this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: entries }));
  }

  // Forget a tab's schedule (on tab close).
  delete(label: string): void {
    this.schedules.delete(label);
    this.removeHooks(label);
    this.announceChange();
  }

  closeTab(label: string): void { this.delete(label); }

  // Remove one entry from a tab's schedule by id, after the client has confirmed the deletion.
  // Persists the reduced list for non-harness tabs and re-emits state so every schedule surface
  // refreshes. Returns false (no persist, no emit) when the tab has no matching entry.
  cancel(label: string, id: string): boolean {
    const current = this.schedules.get(label) ?? [];
    const next = current.filter((e) => e.id !== id);
    if (next.length === current.length) return false;
    this.schedules.set(label, next);
    this.removedHook(label, id);
    const tab = this.managers.tab.byLabel(label);
    if (tab) this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: next }));
    messageBus.emit('state', { type: 'dirty' });
    this.announceChange();
    return true;
  }

  clearAll(): boolean {
    let changed = false;
    for (const [label, entries] of this.schedules) {
      if (entries.length === 0) continue;
      this.schedules.set(label, []);
      this.removeHooks(label);
      const tab = this.managers.tab.byLabel(label);
      if (tab) this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: [] }));
      changed = true;
    }
    if (changed) { messageBus.emit('state', { type: 'dirty' }); this.announceChange(); }
    return changed;
  }

  // The schedule rows for a tab's view: id, spec, humanized next-run time, and the recurring flag.
  view(label: string): ScheduleView[] {
    return scheduleView(this.schedules, label);
  }

  // Every scheduled entry across all still-open tabs, flattened and sorted soonest-first by the raw
  // next-run timestamp, then shaped like `view(label)` rows plus the owning tab label and command.
  aggregatedView(): AggregatedScheduleView[] {
    return aggregatedScheduleView(this.schedules, this.managers.tab.tabs);
  }

  // Fire any commands whose next-run time has passed, in every still-open tab. A recurring entry is
  // rescheduled to its next run; a one-shot drops off. Tabs whose schedule changed are persisted
  // (`TabManager.persist` writes agent tabs only).
  private tick(): void {
    const now = Date.now();
    let changed = false;
    for (const label of this.managers.tab.allLabels()) {
      const tab = this.managers.tab.byLabel(label);
      const sched = this.schedules.get(label);
      if (!tab || !sched || sched.length === 0) continue;
      const remaining = this.fireDue(tab, sched, now);
      if (!remaining) continue;
      this.schedules.set(label, remaining);
      changed = true;
      this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: this.get(label) }));
    }
    if (changed) { messageBus.emit('state', { type: 'dirty' }); this.announceChange(); }
  }

  // The named, low-frequency signal a tab plugin may subscribe to: emitted wherever the scheduled
  // command set itself changes, which is at most once a second from the tick and otherwise only on
  // a user action. Separate from `state: dirty`, which fires on every mutation in the app.
  private announceChange(): void {
    messageBus.emit('schedules', { type: 'changed' });
  }

  // Fire one tab's due entries, returning the surviving schedule (recurring entries rescheduled,
  // one-shots dropped), or undefined when nothing fired. A harness tab receives at most one
  // delivered entry per tick: the command is submitted by a delayed Enter, so two entries due on
  // the same tick would both write their text before either submission landed and the harness
  // would read one concatenated prompt followed by an empty submission while both entries counted
  // as fired. The rest stay due for subsequent ticks. Agent tabs dispatch synchronously and keep
  // their existing multi-entry behavior.
  private fireDue(tab: Tab, sched: ScheduleEntry[], now: number): ScheduleEntry[] | undefined {
    let isChanged = false;
    const remaining: ScheduleEntry[] = [];
    const budget = tab.view === 'harness' ? 1 : Infinity;
    let delivered = 0;
    for (const e of sched) {
      if (e.nextRun > now || delivered >= budget || !this.fire(tab, e)) { remaining.push(e); continue; }
      delivered++;
      this.fireHook(tab.label, e.id);
      if (now - e.nextRun > SCHEDULE_LATE_THRESHOLD_MS) {
        const duration = formatLateDuration(now - e.nextRun);
        const cause = e.nextRun < this.lastResume ? ' (system was asleep)' : '';
        notify(this.managers, 'schedule-late', tab.label, `${e.command} ran ${duration} late${cause}`);
      }
      isChanged = true;
      if (e.recurring) remaining.push({ ...e, nextRun: computeNextRun(e, new Date()) });
    }
    return isChanged ? remaining : undefined;
  }

  // Deliver a due entry to its tab: typed into a harness PTY as a line of input, or dispatched
  // through an agent tab's command pipeline. Returns false when delivery must wait (the harness
  // is not running), leaving the entry due so it retries on a later tick.
  private fire(tab: Tab, e: ScheduleEntry): boolean {
    if (tab.sessionTerminated || (tab.remote && !this.managers.remote.get(tab.label)?.attached)) return false;
    if (tab.view === 'harness') {
      if (tab.harness?.status !== 'running' || !tab.harness.ptyId) return false;
      typeIntoHarness(this.managers.pty, tab.harness.ptyId, tab.harness.name, e.command);
      notify(this.managers, 'schedule-fire', tab.label, e.command);
      return true;
    }
    this.managers.command.dispatchTo(tab.label, `${e.command} ## scheduled ##`, { detect: false });
    notify(this.managers, 'schedule-fire', tab.label, e.command);
    return true;
  }

  // Hand a delivered entry's caller its outcome, once. The hooks are dropped as they run, so a
  // later entry reusing the id is not answered by this one's callbacks.
  private fireHook(label: string, id: string): void {
    const hooks = this.hooks.get(label)?.get(id);
    if (!hooks) return;
    this.forgetHook(label, id);
    hooks.fired?.();
  }

  // An entry left the schedule without being delivered — the user cancelled it, or a tab close or a
  // clear took the whole set. Its caller learns that too, so a pending action it is displaying does
  // not outlive the entry backing it. Reported exactly once, and never for an entry that was never
  // there.
  private removedHook(label: string, id: string): void {
    const hooks = this.hooks.get(label)?.get(id);
    if (!hooks) return;
    this.forgetHook(label, id);
    hooks.removed?.();
  }

  private forgetHook(label: string, id: string): void {
    const forTab = this.hooks.get(label);
    forTab?.delete(id);
    if (forTab?.size === 0) this.hooks.delete(label);
  }

  private removeHooks(label: string): void {
    const forTab = this.hooks.get(label);
    if (!forTab) return;
    this.hooks.delete(label);
    for (const hooks of forTab.values()) hooks.removed?.();
  }

  private entryHooks(label: string, id: string, hooks: EntryHooks): void {
    const forTab = this.hooks.get(label) ?? new Map<string, EntryHooks>();
    forTab.set(id, hooks);
    this.hooks.set(label, forTab);
  }
}