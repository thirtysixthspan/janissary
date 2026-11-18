# Resolve saved names for agent targets

**Complexity: 4/10** — ~24 added production lines in one existing file, 6 requirements and 13 scenarios (p=4.935)

## Goal

Make `agent on <name>` use the effective destination and preserve its port when opening or reusing a remote workspace. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-5-remote-shell-and-harness.md`.

## Implementation

`resolveAgentLaunchTarget` in `src/agent/launch-target.ts:30` already routes an explicit `on` selector to `resolveRemoteAgentTarget`. In `src/agent/remote-target.ts:30`, keep the `parseRemoteAddress` validation first, then call `resolveRemoteLaunchAddress(managers, sourceLabel, parsed)` from the preceding plan. That helper owns catalog precedence, the deduplicated malformed-file notice attributed to the source label, and literal fallback for qualified selectors, missing matches, or an unusable catalog. The command parser and the implicit workspace inheritance path keep their current contracts.

Use the resolved path to decide whether reuse is possible. An explicit path provisions that remote root on a fresh run-only channel. With no path, check the source channel first, keeping the attached-channel and known-workspace checks in `resolveRemoteAgentTarget`, then search usable entries with `establishedLabel` at `src/agent/remote-target.ts:16` and `isUsableEntry` at `src/remote/attach.ts:130`. Use one local endpoint comparison in both branches. Compare the full SSH destination, including any user, case-insensitively, and compare optional ports exactly. Two omitted ports match, and omission remains distinct from any explicit port because SSH configuration can supply the default. The chosen live channel keeps its original launch identity and acquires only the existing agent lease.

Pass the complete resolved address to `managers.remote.create` at `src/agent/remote-target.ts:54` when starting a fresh channel. Keep the existing login-directory discovery for a pathless address and the same non-interactive transport, clone depth, 15-second readiness wait, and release paths after success, failure, or cancellation.

## Tests and verification

Extend `src/agent/remote-target.test.ts` using its `managersWith` fixture at line 28. Exercise case-insensitive saved-name precedence, invalid selectors, qualified and unmatched literal selectors, and the unusable-file fallback. Assert source precedence when both candidates match, usable established-channel fallback, and exact port comparison in both branches, including omitted versus explicit ports. Assert that a saved path forces a fresh channel and that a pathless miss launches with the resolved endpoint and no path. Verify the acquired lease still belongs to the borrowed channel or replaces the temporary label on a fresh one. Keep the existing unavailable-entry regressions.

Update the remote workspace rules in `product/specs/agent-command.md` and `product/specs/remote-server.md`. Run `$janissary/scripts/run.mjs check-diff`. With a scratch catalog and two fixture SSH endpoints on the same host, run `agent on lab execute <fixture task>` with `lab` set to the second port and confirm the task runs in the workspace reached through that endpoint.

## Out of scope

Changing what ACP-only channels can park or adding Sessions rows for ACP activity.
