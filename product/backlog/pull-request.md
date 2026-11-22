<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's one-time editor death notice after a reply has already settled.

Existing Issue: When a persona agent dies between editor requests, the core role session forgets its slot before invoking the death hook, so the editor handler's connectionLost callback never runs and the death is reported nowhere. Severity: 6/10

Existing Risk: 5/10 - A persona connection that died after a successful suggestion stays silent; the next `>` request fails on a closed session and the user cannot tell the connection is gone until the tab is closed.

Proposal Risk: 2/10 - The notice is delivered once through the existing handler path, but any fix that orders forget after the hook must keep model fallback and late-error guards intact so a replaced session cannot emit a second notice.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "restore the editor persona session's one-time death notice after a settled reply". In `src/acp/persona-role-session.ts`, `PersonaRoleSessionManager.died` deletes the runtime slot (`forget`) before calling `state.hooks.onError`, while the wrapper installed by `EditorAcpManager.session` in `src/editor/acp-manager.ts` calls `EditorAcpManager.died`, which returns early once the slot is gone; the core hooks then no-op because no prompt is pending. Rewire this so the editor's stored hook is still reached for a death after a settled reply — for example, keep a session-to-hooks map on `EditorAcpManager` consulted by `died` instead of reading `existingPersonaRoleRuntime`, or invoke the captured hooks before `forget` while keeping `settleAcpPrompt` working from its captured attempt state. Keep the `state.session !== session` guard so a closed or replaced session's late error is ignored, and keep the single-notice behavior in `connectionLost` in `src/editor-suggest/handler.ts`. Add an integration test (not just the current mocked-hook test in `src/editor-suggest/handler.test.ts`) that drives a real `PersonaRoleSessionManager` death after a settled reply and asserts exactly one editor-suggest death notification and no second callback; the existing mid-request-error and no-duplicate tests must keep passing.


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
