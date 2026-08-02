# Initialize monitor subscriptions with live resources

Complexity: 5/10

## Goal

Remove the unsafe `undefined as unknown as` assertions used while constructing `MonitorSub`. A monitor record should only be typed as live after it owns its ACP session and interval timer.

## Approach

Split monitor session creation from priming. `MonitorManager.start()` will create the session from the not-yet-registered monitor data, construct the complete `MonitorSub` with the returned session and a real timer, then prime and subscribe it. Existing respawn behavior will continue using the combined open-and-prime helper.

## Implementation steps

1. Introduce a setup shape derived from `MonitorSub` without `session` and `timer`, and split `openMonitorSession` into session creation and priming helpers while preserving connection callbacks and lifecycle behavior.
2. Update `MonitorManager.start()` to create the session before constructing the complete record and to allocate the timer before subscription and feed seeding; remove both type assertions.
3. Extend the monitor session tests for the separated creation/priming behavior and run the focused monitor suite.

## Tests

- Run `./scripts/run.mjs check-diff` after each implementation step.
- Keep all existing `src/monitor/session.test.ts` and `src/monitor/manager.test.ts` behavior coverage passing.
- Add focused assertions that session creation returns the spawned live session and priming drives the expected initial prompt.

## Specs and documentation

No user-visible behavior, monitor command, lifecycle outcome, or display changes are planned. `product/specs/monitoring.md`, `help.md`, and `documentation/user-documentation/` should remain unchanged.

## Out of scope

- Making `MonitorSub.session` or `MonitorSub.timer` optional.
- Changing monitor scheduling, subscriptions, feed seeding, ACP prompts, or error handling.
