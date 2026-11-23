<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the stale monitor web-tools example from the ACP spec's permission paragraph.

Existing Issue: `product/specs/acp.md` still says the shared ACP transport's permission denial is overridden only by "a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run", but this pull request removed monitor-owned sessions and their tools line, so a monitor has no allowlist of its own. Severity: 2/10

Existing Risk: 3/10 - A contributor reading the ACP spec designs against a monitor-owned web-tool allowlist and permission policy that no longer exists, and gets a wrong picture of which consumers can approve harness tool calls on the core pipeline.

Proposal Risk: 1/10 - The edit is confined to one clause of one spec paragraph with no code change, and the permission behavior is already pinned by `src/acp/index.test.ts` and `src/acp/tools.ts`, so a regression is unlikely.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "remove the stale monitor web-tools example from the ACP spec permission paragraph". In `product/specs/acp.md`, edit only the paragraph beginning "The session's configured provider/model appears in its connection row after the handshake": replace "only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one" with wording that names the still-valid approver (an autonomous run, or a consumer that supplies its own `allowedTools` to `connectAcp`) and states that core role sessions, including those driven by monitor personas, deny harness permission requests. Verify the new wording against the `decidePermission(options.allowedTools, ...)` call in `src/acp/index.ts` and the `allowedTools` handling in `src/acp/tools.ts`, where that option is supplied only by direct `connectAcp` callers, and against `src/monitor/live-monitors.ts`, where monitor flushes call `managers.acp.promptResult` instead of spawning their own connection. Leave every other paragraph of `product/specs/acp.md`, all other specs, all source files, and the pull request description and title untouched. Read the paragraph back after editing and confirm no "monitor's web tools" claim remains; the existing permission tests in `src/acp/index.test.ts` stay untouched and passing.
