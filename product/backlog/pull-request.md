<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the shared role-session respawn path so one monitor's failure does not wedge a sibling on the same owner tab.

Existing Issue: `respawnMonitorSession` closes the owner's role slot unconditionally, so when two monitors on one owner declare the same role the sibling keeps `reg.session` bound to the killed session; its next flush reports "ACP session closed." and respawns again, killing the fresh session the first monitor just opened. Severity: 6/10

Existing Risk: 6/10 - Every bundled persona declares `ask`, so two monitors on one tab commonly share a slot; one rate limit or agent error makes them repeatedly close each other's sessions, both stop producing suggestions, and the transcript fills with restart lines.

Proposal Risk: 3/10 - A coordination fix must preserve the stop-path survivor behavior in `stopMonitor` and each monitor's independent context reset, or it trades the wedge for a leaked or prematurely closed session.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "coordinate shared role-session respawn across monitors on one owner". In `src/monitor/session.ts`, change `respawnMonitorSession` so it does not close the owner's `personaRoles` slot when another live monitor on that owner still uses the same role — use the same sibling check `stopMonitor` applies in `src/monitor/stop.ts` — and instead re-bind this registration to the current shared session; when the session really died, close it once and re-point every sibling registration's `reg.session` to the fresh session `openMonitorSession` primes. In `src/acp/persona-role-session.ts`, give each consumer its own death hook rather than overwriting the single `state.hooks` in `session`, so a connection-level death reaches all monitors sharing the slot. Add a colocated test in `src/monitor/manager.test.ts` that starts two monitors with the same role on one owner, fails one session, and asserts the sibling tracks the new session, both keep flushing, and no session is killed twice; the existing stop, restart, and respawn tests must keep passing.


* Remove the obsolete harness and tools fields from monitor test persona fixtures after the persona type change.

Existing Issue: Three monitor test files still build `Persona` fixtures with the removed `harness`/`tools` shape and no `role`, so the fixtures describe a persona format the loader no longer accepts. Severity: 2/10

Existing Risk: 2/10 - A reader can infer that personas still carry a harness directive and tool allowlist, and the fixtures would fail to compile the moment test files joined the typecheck project.

Proposal Risk: 1/10 - The cleanup changes only test data, so the residual risk is a fixture that no longer carries a field a future test expects.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "clean stale persona fixtures in the monitor tests". In `src/monitor/info.test.ts`, `src/monitor/stop.test.ts`, and `src/monitor/session.test.ts`, reduce each `Persona` object literal to `name`, `role`, and `body`, adding a `role` where it is missing in `src/monitor/info.test.ts` and dropping the leftover `harness` and `tools` properties in all three. Keep every current assertion intact; no production code changes belong in this work. The real bundled persona tests in `src/personas.test.ts` and the launcher reader tests in `src/plugins/launcher/persona.test.ts` already cover the new format and must keep passing.
