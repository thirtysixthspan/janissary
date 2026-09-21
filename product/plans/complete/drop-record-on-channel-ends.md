# One line per session: a terminated session's record is dropped, and a closed channel cannot resurrect it

## Complexity

3/10 — one teardown hook in the remote lifecycle, one guard in the mirror, one manager method, tests.

## Goal

The entry: "closing a harness leaves an active and detached status line for the same harness. a single ssh/agent/harness should only have one line in sessions list at any time." Two defects make a one-session case read as two rows:

1. `mirror()` re-adds a record for a **closed** entry (`recordOf` does not test `entry.closed`), so a channel teardown immediately resurrects the record it should have ended.
2. `terminateRemoteEntry` — the genuine end through the channel lifecycle (last-label `release`, `endRemoteProcess`'s final sweep, `connection close`) — never tells `SessionsManager` the session is over, so the record survives as a detached row for a peer that was actually shut down.

## Approach

- `SessionsManager.dropSession(session)`: removes the record (memory + file), clears its failure, emits the change signal.
- `terminateRemoteEntry` calls `dropSession` for the entry's session id (guarded — test harness `Managers` may not carry a real sessions manager). Records for sessions that parked via `detach`, or that a sessions-tab end/reattach action narrates itself, are untouched: detach never calls this, and the action layer drops its own records.
- `mirror()` skips closed entries so a terminating channel cannot re-write its record on the changed signal the drop itself raises.

## Tests

- `src/remote/manager.test.ts`: on the last release, the sessions manager's record for the channel's session id is dropped (stub sessions manager asserts the call).
- `src/sessions/manager.test.ts`: a closed entry produces no record and no row even when a record exists; `dropSession` removes the record, the row, and persists.

## Spec

- `product/specs/sessions-tab.md`: a session ended by the channel lifecycle leaves no row — one line per session, always.

## Out of scope

- The duplicate-row entry's other suspect (relaunch resume naming new ids) — covered by the same drop; no change to detach or expiry.
