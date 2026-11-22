<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the stale monitor manager comment that still calls sessions dedicated and tool-less.

Existing Issue: The `MonitorManager` class comment in `src/monitor/manager.ts` still says each monitor is a dedicated, tool-less ACP session, but this commit moved monitors onto shared role-backed sessions that use the role's command grants. Severity: 2/10

Existing Risk: 2/10 - A reader relies on the comment to judge the monitor's tool boundary and assumes a fixed deny-all policy that no longer exists.

Proposal Risk: 1/10 - The replacement wording can drift again if a later change alters the launch path, but no behavior depends on the comment.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct the stale monitor manager comment about dedicated tool-less sessions". Rewrite the `MonitorManager` class comment in `src/monitor/manager.ts` to describe one role-configured core ACP session per tab and role, shared by monitor and editor persona requests, using the role's grants and fallback instead of a persona tool allowlist. Keep it consistent with the Role-backed sessions section of `product/specs/monitoring.md` and the editor owner comment in `src/editor/acp-manager.ts`. No behavior change; the existing monitor tests cover the paths the comment describes.
