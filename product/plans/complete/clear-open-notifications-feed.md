# Clear the Open Notifications Feed

**Complexity: 3/10** — clearing needs to update the existing view tab through the same state-change signal used when it is seeded, while keeping the queue, record, and toast clearing behavior intact.

## Goal

Make `notifications clear` empty the rendered feed when it is already open without changing tab placement, active tab, or transcript history elsewhere.

## Approach

Add a tab-owned helper that empties the existing notifications log and emits the normal dirty-state signal. Call it after clearing the queue and record. Extend the command integration tests to cover the open feed's log and client buffer, followed by a new notification.

## Implementation steps

1. Add a notifications-tab clear helper and invoke it from `clearNotifications`.
2. Verify the rendered buffer clears and later notifications appear alone.
3. Update the notifications spec to describe the feed's immediate clear behavior.

## Tests

- An open feed's log and rendered `bufferLines` become empty after clear.
- A later notification is the only line in the feed.
- Clearing without an open feed still opens nothing and preserves queue, record, and toast checks.

## Out of scope

- Changing tab focus, placement, or transcript history in the issuing tab.
