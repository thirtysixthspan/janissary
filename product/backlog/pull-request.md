<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the monitor stop-and-restart path so it opens a fresh role session.

Existing Issue: `stopMonitor` kills `reg.session` directly, but that session is now the shared `personaRoles` slot entry, so the slot survives holding a killed session and a later `monitor` for the same persona and role on the same tab reuses it. Severity: 6/10

Existing Risk: 6/10 - After `unmonitor`, restarting the same persona silently produces a dead session whose prompts fail with "ACP session closed.", leaving the monitor permanently broken until the tab is closed.

Proposal Risk: 2/10 - Closing through the owner releases the slot, but two monitors on one owner that share a role also share one session, so a stop must not tear down a session another live monitor still uses.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "release the shared role slot when a monitor stops so restart opens a fresh session". In `src/monitor/stop.ts`, replace the direct `reg.session.kill()` with a close through `managers.personaRoleSessions.close(reg.owner, reg.persona.role)` so the runtime state is forgotten rather than left holding a killed session. Decide and pin the shared-slot case (two monitor registrations on one owner declaring the same role): close only when no other live monitor on that owner uses the same role, otherwise leave the session for the survivor. Keep the current behavior for dropping a single target and for reporting-tab teardown. Add a test in `src/monitor/manager.test.ts` that starts a monitor, stops it, starts the same persona again on the same owner, and asserts a fresh session is primed with the suggestion format; the existing stop, reset, and respawn tests must keep passing.


* Correct the stale monitor manager comment that still calls sessions dedicated and tool-less.

Existing Issue: The `MonitorManager` class comment in `src/monitor/manager.ts` still says each monitor is a dedicated, tool-less ACP session, but this commit moved monitors onto shared role-backed sessions that use the role's command grants. Severity: 2/10

Existing Risk: 2/10 - A reader relies on the comment to judge the monitor's tool boundary and assumes a fixed deny-all policy that no longer exists.

Proposal Risk: 1/10 - The replacement wording can drift again if a later change alters the launch path, but no behavior depends on the comment.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct the stale monitor manager comment about dedicated tool-less sessions". Rewrite the `MonitorManager` class comment in `src/monitor/manager.ts` to describe one role-configured core ACP session per tab and role, shared by monitor and editor persona requests, using the role's grants and fallback instead of a persona tool allowlist. Keep it consistent with the Role-backed sessions section of `product/specs/monitoring.md` and the editor owner comment in `src/editor/acp-manager.ts`. No behavior change; the existing monitor tests cover the paths the comment describes.
