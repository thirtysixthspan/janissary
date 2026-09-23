import type { LogEntry } from '../tab/types.js';
import type { NotificationEventType } from './index.js';
import { capLog } from '../tab/transcript-log.js';

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
};

export class NotificationQueue {
  private entries: RecordedNotification[] = [];

  append(notification: RecordedNotification): void {
    this.entries = capLog([...this.entries, notification], NOTIFICATION_QUEUE_LIMIT);
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
  }

  // Whether `now` completes a burst — this many notifications recorded inside the window, counting
  // the one just appended. A scan over the arrival times already held rather than a second list
  // kept in parallel: linear over at most `NOTIFICATION_QUEUE_LIMIT` entries, once per notification.
  isBurst(now: Date): boolean {
    const since = now.getTime() - NOTIFICATION_BURST_WINDOW_MS;
    let count = 0;
    for (const notification of this.entries) {
      if (notification.recordedAt.getTime() >= since) count += 1;
    }
    return count >= NOTIFICATION_BURST_THRESHOLD;
  }
}
