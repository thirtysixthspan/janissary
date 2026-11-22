<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's notification-only role-failure promise on the monitor path by removing the extra owner-tab reply line.

Existing Issue: The plan, the ACP and monitoring specs, and the description all say an unknown role or a role with no enabled models produces only the exact notification with no reply in the owner tab, but the monitor priming path appends a local `monitor <persona>: <notification text>` line to the owner transcript after the core refusal. Severity: 6/10

Existing Risk: 5/10 - A user sees a monitor-attributed line that reads like a reply in the tab transcript for a failure the plan says has no reply at all, and the colocated test pins that line so the divergence survives every later change to the path.

Proposal Risk: 2/10 - The core refusal already posts the exact notification and starts no session, so dropping the local append removes a duplicate signal while leaving priming, in-flight clearing, and death handling intact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "remove the extra monitor owner-tab line on role configuration failures". In `src/monitor/session.ts`, change the refusal branch of `primeMonitorSession` so a non-answered result from `promptPersonaRole` only clears `reg.inFlight` and writes nothing to the owner tab; keep the answered path, the connection-info line, and the idle-session binding unchanged, and let the core entry's `manual` notification remain the sole signal. Update `src/monitor/session.test.ts` so the notification-only role-failure case asserts that no `monitor ...` failure line is appended while `inFlight` still clears and the monitor keeps its idle session, replacing the current expectation that asserts the line. The Shared consumers paragraph of `product/specs/acp.md` and the role-backed sessions paragraph of `product/specs/monitoring.md`, along with the description's configuration-failure claim, already state the correct no-reply behavior and need no edit. The notification-only unit tests in `src/acp/persona-role.test.ts` and the priming and slot-release tests in `src/monitor/manager.test.ts` and `src/monitor/stop.test.ts` must keep passing untouched.
