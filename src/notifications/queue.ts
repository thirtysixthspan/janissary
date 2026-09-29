import type { LogEntry } from '../tab/types.js';
import type { NotificationEventType } from './index.js';
import { capLog } from '../tab/transcript/log.js';
import { withRepeatCount } from './format.js';

// Holding a notification, separated from rendering one. The queue owns every notification the user
// was given for the length of the run, whether or not a notifications tab exists to show it: the
// feed renders the queue when it is visible, a toast renders a single notification when it is not,
// and neither surface owns what it displays. Before this, a notification *was* a transcript entry
// on the notifications tab, so closing the tab discarded the lot.
//
// In memory and run-scoped on purpose. The durable trail is `.janissary/notifications.json`
// (see `record.ts`), which is written but never read back — the queue is not rehydrated from it,
// which is what keeps the feed a live view rather than a restored one.

// The most notifications held at once, oldest dropped first. Because the feed renders the queue,
// this is also the most the feed can show — `transcriptMaxLines` no longer governs it. A session
// producing more than this loses the oldest from the feed; the record file is the way further back.
export const NOTIFICATION_QUEUE_LIMIT = 200;

// Sustained activity is more than a corner can carry: this many notifications arriving inside
// `NOTIFICATION_BURST_WINDOW_MS` escalates to the feed instead of stacking more toasts.
export const NOTIFICATION_BURST_THRESHOLD = 3;
export const NOTIFICATION_BURST_WINDOW_MS = 10_000;

export type RecordedNotification = {
  event: NotificationEventType;
  // The tab the event happened to — the label the feed line and the toast both lead with.
  tabLabel: string;
  // The rendered message body (see `notificationText`), without the provenance header.
  message: string;
  // The sending tab's own dot color, so a toast can carry the same dot the feed line does.
  color?: string;
  // The feed's transcript entry, rendered once here so a tab opened later can be seeded with it
  // directly rather than re-deriving the line.
  entry: LogEntry;
  // When the event was actually detected — the current moment for a live notification, an earlier
  // one for a report a remote harness queued while detached and replayed on reattach.
  detectedAt: Date;
  // When this queue was told about it. Distinct from `detectedAt` precisely because a replayed
  // notification carries an old detection time but arrives now, and the burst test asks about
  // arrival: several replays landing together are a burst even though they were detected hours ago.
  recordedAt: Date;
  openFile?: string;
  openTab?: string;
  // How many sequential occurrences this entry stands for. Absent means one.
  count?: number;
};

// What `append` did: the entry now held for the notification, and whether it folded into the
// newest one rather than being added after it.
export type HeldNotification = { held: RecordedNotification; repeated: boolean };

// A repeat is the same tab reporting the same message. Time is deliberately not part of identity,
// so the same failure minutes apart still folds as long as nothing else arrived in between.
function repeats(previous: RecordedNotification, next: RecordedNotification): boolean {
  return previous.tabLabel === next.tabLabel && previous.message === next.message;
}

// The feed line for a repeat folded into `previous`: the newest entry with the `(N times)` suffix,
// linking every file the run has carried so far rather than only the newest one — each repeat's
// capture stays reachable from the one line that now stands for it.
function foldedEntry(previous: LogEntry, next: LogEntry, count: number): LogEntry {
  const openFiles = [...(previous.openFiles ?? []), ...(next.openFiles ?? [])];
  return {
    ...next,
    output: withRepeatCount(next.output, count),
    ...(openFiles.length > 0 && { openFiles }),
  };
}

export class NotificationQueue {
  private entries: RecordedNotification[] = [];

  // Arrival times inside the burst window. Kept apart from `entries` because a folded repeat is one
  // entry but still one more arrival: a flood of one message must escalate the same as any other.
  private arrivals: Date[] = [];

  // Hold a notification. A sequential repeat replaces the newest entry — taking its time and tab
  // link, adding its file link to the ones already folded, bumping its count, and re-rendering its
  // feed line with the `(N times)` suffix — so a flood of one message costs one line of the feed
  // and one slot of the limit.
  append(notification: RecordedNotification): HeldNotification {
    this.noteArrival(notification.recordedAt);
    const previous = this.entries.at(-1);
    if (previous === undefined || !repeats(previous, notification)) {
      this.entries = capLog([...this.entries, notification], NOTIFICATION_QUEUE_LIMIT);
      return { held: notification, repeated: false };
    }
    const count = (previous.count ?? 1) + 1;
    const held = { ...notification, count, entry: foldedEntry(previous.entry, notification.entry, count) };
    this.entries = [...this.entries.slice(0, -1), held];
    return { held, repeated: true };
  }

  private noteArrival(at: Date): void {
    const since = at.getTime() - NOTIFICATION_BURST_WINDOW_MS;
    this.arrivals = [...this.arrivals.filter((arrival) => arrival.getTime() >= since), at];
  }

  get all(): readonly RecordedNotification[] {
    return this.entries;
  }

  // The feed's contents: every held notification's rendered line, oldest first, in the order a
  // tab's own log would carry them.
  get logEntries(): LogEntry[] {
    return this.entries.map((n) => n.entry);
  }

  clear(): void {
    this.entries = [];
    this.arrivals = [];
  }

  // Whether `now` completes a burst — this many notifications arrived inside the window, counting
  // the one just appended and every folded repeat. `arrivals` is pruned to the window on each
  // append, so the scan stays short however long the run.
  isBurst(now: Date): boolean {
    const since = now.getTime() - NOTIFICATION_BURST_WINDOW_MS;
    const count = this.arrivals.filter((arrival) => arrival.getTime() >= since).length;
    return count >= NOTIFICATION_BURST_THRESHOLD;
  }
}
