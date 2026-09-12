# Cover monitor teardown directly

**Complexity: 3/10** (threshold: 7). The teardown module has a small synchronous interface; fake sessions, subscriptions, and timers can exercise it without starting a process.

## Goal

Pin resource cleanup and reporting-tab ownership when a monitor stops or loses a target.

## Approach

Add colocated tests importing `stopMonitor` and `closeIfUnfed` directly. Build complete typed `MonitorSub` fixtures, use fake timers, and mock only the reporting-window calls. Keep target formatting and alias resolution real. The backlog predates alias resolution: test its current behavior, while preserving the unmatched-target no-op and existing serialized target comparison.

## Implementation steps

1. Add `src/monitor/stop.test.ts` with typed fixtures and every case below; run `./scripts/run.mjs check-diff`.
2. Clarify the existing lifecycle contract in `product/specs/monitoring.md`, including target removal and inline/shared reporting behavior; run `./scripts/run.mjs check-diff`.
3. Verify the existing manager, window, and target tests unchanged. Check `help.md` and `documentation/user-documentation/automation/monitoring.md`; no public documentation changes are needed because behavior is unchanged.
4. Promote this plan to complete, remove only the resolved backlog entry and its detail paragraphs, run `./scripts/run.mjs check-diff`, and ship through `ai/tasks/workspace/merge-change-to-master.md`.

## Tests

- An unknown owner/name returns false without changing registrations or resources.
- Removing an intermediate tab or group target refreshes formatted metadata, preserves context bytes, and leaves the session, subscriptions, and interval running.
- Case-insensitive aliases resolve to the canonical target before removal.
- An unmatched target leaves targets and resources intact while refreshing the unchanged metadata; serialized group property order retains its current matching behavior.
- Stopping outright or removing the last external target unsubscribes every subscription, clears the interval, kills the session, removes the registration, and closes its reporting tab exactly once. Repeating the stop has no effects.
- Another owner's external monitor with the same runtime name keeps the reporting tab open and retains its resources until it stops.
- Inline stops, with or without a target argument, release resources without closing a reporting tab.
- Direct `closeIfUnfed` calls close an unfed tab, preserve one fed by a matching external monitor, and ignore inline or differently named monitors even when they share a persona.

## Out of scope

Production logic changes, replacement of serialized target equality, manager wiring changes, new public documentation, and unrelated debt.
