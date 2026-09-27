import type { VisualizationRecord } from './store.js';

// One timer for every visualization, owned here rather than by the manager so the manager's file
// stays about what a visualization is and this one is about when a source is read again.
//
// Two rules decide what it does. It polls only what a tab is open for, so a saved visualization is
// never fetched behind the user's back — the interval means "keep this current while I am looking at
// it", not "run a pipeline". And it re-reads nothing while a read is already in flight, so a slow
// endpoint cannot queue work the next tick would immediately supersede. Both are decisions about
// reach rather than about correctness, which is why they live apart from the record they concern.
export class VisualizationRefresh {
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly now: () => number,
    // The ids whose tab is open, read fresh on every pass: the tabs are the truth, and a cached copy
    // would be one more thing that can drift from them.
    private readonly openIds: () => readonly string[],
    private readonly read: (id: string) => void,
    private readonly recordFor: (id: string) => VisualizationRecord | undefined,
  ) {}

  // Recomputes and re-arms. Called after anything that can change the answer — an interval, a read
  // landing, a tab opening or closing — because a timer armed for a stale set of intervals is worse
  // than no timer at all.
  reschedule(): void {
    this.clear();
    const due = this.untilNext();
    if (due === undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.poll();
    }, due);
  }

  dispose(): void {
    this.clear();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  // The shortest wait across everything open, measured from when each was last read rather than from
  // when the timer was armed, so a read that took a while does not immediately queue the next one.
  private untilNext(): number | undefined {
    const now = this.now();
    let soonest: number | undefined;
    for (const id of this.openIds()) {
      const wait = this.untilDue(id, now);
      if (wait === undefined) continue;
      soonest = soonest === undefined ? wait : Math.min(soonest, wait);
    }
    return soonest;
  }

  private untilDue(id: string, now: number): number | undefined {
    const record = this.recordFor(id);
    if (!record || record.refreshSeconds <= 0) return undefined;
    return Math.max(record.refreshSeconds * 1000 - (now - (record.readAt ?? 0)), 0);
  }

  private poll(): void {
    const now = this.now();
    for (const id of this.openIds()) {
      if (this.untilDue(id, now) === 0) this.read(id);
    }
    this.reschedule();
  }
}
