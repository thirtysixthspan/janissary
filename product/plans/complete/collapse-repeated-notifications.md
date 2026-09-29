# Collapse repeated notifications in the feed

**Complexity: 4/10** — a fold step in the existing notification queue, one new feed-tab helper that rewrites the newest line in place, and a rendered `(N times)` suffix. No wire change, no new event, no persistence change.

## Goal

When the same tab reports the same message several times in a row, the notifications tab shows one line carrying a `(N times)` indicator instead of N identical lines. Identity is the originating tab plus the rendered message; the time is not part of it, so repeats minutes apart still fold together as long as nothing else was recorded in between.

## Approach

The feed renders the notification queue (`src/notifications/queue.ts`), and a live notification is mirrored into an open feed by `appendNotification` (`src/notifications/tab.ts`). Folding therefore belongs in the queue, where the feed's contents are decided, with the feed tab told to rewrite its newest line rather than append a new one.

1. **Fold in the queue.** `NotificationQueue.append` compares the incoming notification with the newest one held. When `tabLabel` and `message` match, it replaces that entry with the incoming one (latest time, latest link targets) carrying `count = previous count + 1`, and re-renders the feed entry's output with the `(N times)` suffix. `append` reports what it held and whether it folded.
2. **Keep the burst test about arrivals.** Today `isBurst` counts held entries by `recordedAt`. Once repeats fold, a flood of one message would be a single entry and would never escalate, leaving each repeat to raise its own toast. The queue keeps the arrival times of the last window separately, and `isBurst` counts those, so repeats still escalate exactly as they do today. `clear` empties them too.
3. **Rewrite the newest feed line.** A new `replaceLatestNotification(managers, entry)` in `src/notifications/tab.ts` replaces the open feed's last log entry (falling back to an append when the feed is empty), marks the feed unread the way an append does, and signals a state refresh. `deliverNotification` calls it instead of `appendNotification` when the queue folded.
4. **Render the suffix in `format.ts`.** A pure `withRepeatCount(message, count)` returns the message unchanged for a count of 1 and `<message> (N times)` otherwise.

Why fold rather than render-time collapsing over a raw queue: folding means a flood of one message no longer evicts the rest of the 200-entry history, and the feed seeded after the fact (`seedFromQueue`) gets the collapsed lines for free.

## What stays the same

- Toasts: each repeat still toasts (subject to the unchanged burst and visibility rules) with the bare message. The issue is about the feed.
- The record file `.janissary/notifications.json` keeps one line per occurrence. It is the durable grep trail, and a count would hide when each repeat happened.
- `RecordedNotification.message` stays the bare message, so identity and toasts never see the suffix.

## Implementation steps

1. `src/notifications/format.ts`: add `withRepeatCount(message, count)`.
2. `src/notifications/queue.ts`: add an optional `count` to `RecordedNotification`; fold in `append`, which now returns `{ held, repeated }`; track arrival times for `isBurst`; clear them in `clear`.
3. `src/notifications/tab.ts`: add `replaceLatestNotification`.
4. `src/notifications/deliver.ts`: use the fold result to choose between append and replace.
5. `src/notifications/tab-test-fixture.ts`: supply `markUnread` on the fake host so fakes survive a repeated notification.
6. `src/profile/entry-openers.test.ts`: its hand-rolled fake queue's `append` returns what the real one now returns, since delivery reads the fold result.

## Tests

- `src/notifications/format.test.ts`: `withRepeatCount` leaves a single occurrence unchanged and suffixes `(N times)` for more.
- `src/notifications/queue.test.ts`: two sequential identical notifications fold into one entry with count 2 and a suffixed feed line carrying the later time; the same message from a different tab does not fold; a repeat separated by another notification does not fold; the queue limit counts folded entries once; repeats still complete a burst; `clear` resets the burst arrivals.
- `src/notifications/tab.test.ts`: `replaceLatestNotification` rewrites the open feed's last line in place, appends when the feed is empty, and is a no-op with no feed open.
- `src/notifications/index.test.ts`: notifying the same message twice with a docked feed open leaves one feed line reading `<message> (2 times)` and one queue entry, while still raising a toast for each.

## Spec and docs

- `product/specs/notifications.md`: a new "Repeated notifications" subsection describing the fold, its identity rule, what the collapsed line shows, and that toasts and the record file are unaffected.
- `documentation/user-documentation/tab-types/notifications.md`: the "Read and scroll the feed" section, which already describes each feed line's format, gains a sentence on the `(N times)` indicator.

## Out of scope

- Collapsing toasts, or collapsing non-adjacent repeats.
- Changing the record file's format.
