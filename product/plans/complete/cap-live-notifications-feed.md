# Cap the Live Notifications Feed at 200 Lines

**Complexity: 3/10** — the queue already defines the limit. The tab append path needs to use that same limit through its standard transcript mutation so broadcasts and trimming events remain intact.

## Goal

Keep an open notifications feed identical to the bounded queue after more than 200 notifications.

## Approach

Allow `TabManager.append` to receive an optional line cap, using the normal transcript append flow with that cap. Pass `NOTIFICATION_QUEUE_LIMIT` for notification feed appends and test queue, log, and rendered buffer parity across overflow and reopen.

## Implementation steps

1. Add an optional per-append cap to the tab manager's existing transcript mutation path.
2. Apply the queue limit to notification feed appends.
3. Verify the oldest line is dropped consistently from the queue, live log, and buffer after overflow and reopen.

## Tests

- Open the feed before 205 arrivals and assert only the newest 200 lines remain in queue and rendered feed.
- Reopening the feed preserves the same retained set.

## Out of scope

- Changing the queue limit or durable record retention.
