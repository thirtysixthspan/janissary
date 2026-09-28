import { datasetKey } from './chart-spec.js';
import type { VisualizationRecord } from './store.js';
import type { VisualizationDataRef } from '../protocol.js';

// One timer for every visualization, owned here rather than by the manager so the manager's file stays
// about what a visualization is and this one is about when its data is read again.
//
// Two rules decide what it does. It polls only what a tab is open for, so a saved visualization is
// never fetched behind the user's back — the interval means "keep this current while I am looking at
// it", not "run a pipeline". And it re-reads nothing while a read is already in flight, so a slow
// endpoint cannot queue work the next tick would immediately supersede.
//
// What a tick does depends on what a chart draws from, and the difference is not cosmetic. A chart on
// the source is an HTTP read and a parse. A chart on a file the agent acquired is a model call, because
// nothing else knows how that data is reached — which is why the intervals stay a fixed set of choices
// rather than becoming a number, and why the chart says its data came from the agent.
export type RefreshDeps = {
  now(): number;
  // The ids whose tab is open, read fresh on every pass: the tabs are the truth, and a cached copy
  // would be one more thing that can drift from them.
  openIds: () => readonly string[];
  // Re-read one dataset. Whether it was read is the reader's business; a drop because one is already in
  // flight is not an error.
  read(id: string, data: VisualizationDataRef): void;
  // Ask the agent to re-acquire one dataset's data for every chart drawing from it.
  reacquire(id: string, data: VisualizationDataRef): void;
  // The shortest interval and the last read time per dataset a record's charts name, which is the whole
  // of what this module needs to know and the reason it asks rather than being handed the record.
  dueFor: (id: string) => readonly Due[];
};

export class VisualizationRefresh {
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly deps: RefreshDeps) {}

  // Recomputes and re-arms. Called after anything that can change the answer — an interval, a read
  // landing, a chart being added, a tab opening or closing — because a timer armed for a stale set of
  // intervals is worse than no timer at all.
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
    const now = this.deps.now();
    let soonest: number | undefined;
    for (const id of this.deps.openIds()) {
      for (const entry of this.deps.dueFor(id)) {
        const wait = this.waitOf(entry, now);
        soonest = soonest === undefined ? wait : Math.min(soonest, wait);
      }
    }
    return soonest;
  }

  // How long until this dataset is due, never below zero: a read that took longer than its own
  // interval is due the moment it lands rather than an interval into the past.
  private waitOf(entry: { seconds: number; readAt: number }, now: number): number {
    return Math.max(entry.seconds * 1000 - (now - entry.readAt), 0);
  }

  private poll(): void {
    const now = this.deps.now();
    for (const id of this.deps.openIds()) {
      for (const entry of this.deps.dueFor(id)) {
        if (this.waitOf(entry, now) > 0) continue;
        if (entry.data.kind === 'source') this.deps.read(id, entry.data);
        else this.deps.reacquire(id, entry.data);
      }
    }
    this.reschedule();
  }
}

// One entry per dataset rather than per chart, so two charts sharing a source are one read and the
// shortest interval across the charts naming it is the one that fires. A dataset with no read yet is
// due immediately, which is what makes a chart drawn on fresh data start keeping itself current
// without waiting out an interval first.
// What the poll is owed by one record, per dataset. A record that is gone is owed nothing: the timer would
// keep re-arming for a visualization nothing can act on any more, because every read it could ask for is
// refused through the index.
export type Due = { data: VisualizationDataRef; seconds: number; readAt: number };

export function owedBy(record: VisualizationRecord | undefined): Due[] {
  if (record === undefined) return [];
  return dueByDataset(
    record.charts,
    (data) => record.datasets.find((entry) => entry.key === datasetKey(data))?.readAt ?? 0,
  );
}

export function dueByDataset(
  charts: readonly { data: VisualizationDataRef; refreshSeconds: number }[],
  readAt: (data: VisualizationDataRef) => number,
): Due[] {
  const soonest = new Map<string, { data: VisualizationDataRef; seconds: number }>();
  for (const chart of charts) {
    if (chart.refreshSeconds <= 0) continue;
    const key = datasetKey(chart.data);
    const current = soonest.get(key);
    if (current === undefined || chart.refreshSeconds < current.seconds) {
      soonest.set(key, { data: chart.data, seconds: chart.refreshSeconds });
    }
  }
  return [...soonest.values()].map((entry) => ({ ...entry, readAt: readAt(entry.data) }));
}
