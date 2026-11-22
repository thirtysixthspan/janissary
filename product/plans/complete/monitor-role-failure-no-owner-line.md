# Remove the monitor owner-tab line on role configuration failures

**Complexity: 2/10** — one production file, five behavioral requirements, no new units (p=3.65)

## Goal

Make a monitor whose persona role is unknown or has no enabled models emit only the core notification, with no monitor-attributed failure line appended to the owner tab, while keeping the rest of priming intact.

## Approach

In the refusal branch of `primeMonitorSession`, stop appending the local `monitor <persona>: <error>` line when `promptPersonaRole` settles without an answer. Clearing `reg.inFlight` remains unconditional, and the core role entry's `manual` notification stays the sole failure signal. The answered path (recording the reply), the connection-info line, and the idle-session binding are left unchanged. Update the colocated test so the notification-only failure case asserts no owner-tab append while `inFlight` still clears and the session stays idle.

## Implementation steps

1. In `src/monitor/session.ts`, remove the `else` branch of the `pending.then` handler in `primeMonitorSession` that appends the `monitor <persona>: ${result.error}` line, leaving `reg.inFlight = false` and the answered-path `recordContext` call as they are. Verify with `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/session.test.ts`, change the notification-only role-failure test so it asserts no `monitor <persona>:` failure line (and no other append) reaches the owner tab while `reg.inFlight` clears and `reg.session` remains the idle session. Verify with `$janissary/scripts/run.mjs check-diff`.
3. Leave `product/specs/acp.md`, `product/specs/monitoring.md`, help pages, and the PR description untouched — they already state the no-reply behavior. Promote the plan and remove the resolved backlog entry, then publish.

## Tests

- Notification-only role failure: `inFlight` clears, the session stays idle, and no `monitor <persona>:` failure line is appended to the owner tab.
- Existing answered-path tests, connection-info line test, prompt/framing test, and respawn test keep passing unchanged.
- Untouched suites in `src/acp/persona-role.test.ts`, `src/monitor/manager.test.ts`, and `src/monitor/stop.test.ts` keep passing through `check-diff`.

## Out of scope

- Changing `promptPersonaRole`, the core `manual` notification, or role resolution.
- Changing the connection-info line, answered-path reply recording, or idle-session binding.
- Editing specs, help pages, or the PR description.
