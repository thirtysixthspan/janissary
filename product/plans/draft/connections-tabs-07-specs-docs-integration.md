# Connections feature specs, documentation, and end-to-end verification

**Complexity: 4/10**

## Goal

Bring contributor and user documentation into line with the implemented connections workflow, then verify the complete feature across persistence, ACP/agent lifecycle, commands, popups, remote cancellation, and plugin loading.

## Decisions and dependencies

- Covers source-plan proposed change 7, all named spec/documentation updates, the full manual verification list, final lazy chunk/build check, and cross-subplan integration verification.
- Depends on completed subplans 01–03, ordered plugin plans 04a–04c, and integration/API plans 05–06. This is an explicit integration deliverable, not deferred cleanup.
- Specs describe observable behavior precisely; user docs explain the user's workflow without implementation details. Keep unrelated existing sessions-tab, agent-monitor, task-picker, and non-tracked ACP consumer behavior unchanged.

## Existing code to reuse

- Existing behavioral descriptions in `product/specs/connection.md`, `acp.md`, `shell-tab.md`, `agent-command.md`, and `tab-plugins.md`.
- Contributor plugin reference changelog in `documentation/developer-documentation/tab-plugins.md` and user ACP guide in `documentation/user-documentation/advanced-agents/acp-agent.md`.
- Existing feature integration patterns in the conversations spec and the final verification command in the source plan.

## Proposed changes

- Update `product/specs/connection.md` for command grammar, list/connection tabs, row ownership/status/actions, popup click behavior, sqlite focus, and retained snapshot controls.
- Update `product/specs/acp.md` for no streaming response panel, asynchronous shell Markdown replies, cancellation, persistent records, and remote cancellation. Update `product/specs/shell-tab.md` § Core ACP connections, `product/specs/agent-command.md` for headed/headless runs in connections, and `product/specs/tab-plugins.md` for API v3 removals, the `connections` topic, and optional `backgroundReplies.line`.
- Add `product/specs/connections-tab.md` defining both list and per-connection tab behavior, pagination, row status, keyboard/mouse interactions, and actions.
- Update `ai/guidelines/plugins-tabs.md` for the new notification topic count, removed `useAcpResponse`, and removal of `launchShellHere()` in v3.
- Update `documentation/developer-documentation/tab-plugins.md` with the v3 breaking change and migration notes. Update `documentation/user-documentation/advanced-agents/acp-agent.md` for the removed panel, asynchronous shell answers, cancellation, and connections tab.
- Run integration checks including shell async/no-panel behavior, duplicate prompt refusal, connection popup navigation, open/closed record persistence and deletion, agent run Terminate, reset status, restart recovery, `connections list`/`close` completion, and remote Cancel. Confirm lazy client chunk separation.

## Tests

- Documentation/spec review against the subplans' tested behavior and exact command/error text; verify every source-plan requirement maps to implemented behavior and a specification.
- Run the diff-scoped verification workflow and production web build/chunk inspection.
- Complete the source plan's manual scenarios: shell prompt while ordinary commands continue; rendered answer at output bottom; list/popup open; collapsed activity; cancel then prompt again; close/reset; agent execute and terminate; restart persistence/read-only/delete confirmation; list/close tab completion.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each docs/integration change.
- Build the production web bundle and confirm the connections plugin remains a separate lazy chunk.
- Review the requirement map against plans 01–03, 04a–04c, 05–06, and the resulting specs/tests; no requirement is left as implied work.

## Out of scope

- Source-code changes, test implementation, or changes to the canonical source plan. This plan only owns its named specs/docs and full-feature verification.
- Rewriting the source plan's original 8/10 complexity during Step 1 decomposition.
