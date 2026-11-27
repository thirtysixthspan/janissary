<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document why the two new MCP notification kinds bypass focus suppression so their explicit classification cannot be quietly reversed.

Existing Issue: The `mcp-failed` and `question-withdrawn` entries added to `EXPLICIT_EVENTS` in `src/notifications/index.ts` are the only entries in that table without the one-line rationale comment its own header comment promises for every entry, so the reason these two must remain visible on an active tab is left unstated at the point the classification is made. Severity: 3/10

Existing Risk: 4/10 - A later contributor, seeing no reason recorded beside these two events, may move them behind a config toggle or the ambient focus rule and silently drop the MCP startup-failure notice and the withdrawal notice while their own tab is active.

Proposal Risk: 2/10 - Adding the two comments makes the classification reasoning visible in the table but changes no behavior, so the events still rely on the same focus-suppression contract for delivery and must keep their explicit classification.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "document why the two new MCP notification kinds bypass focus suppression". In `src/notifications/index.ts`, add a one-line rationale comment beside each of the `mcp-failed` and `question-withdrawn` entries in `EXPLICIT_EVENTS`, following the pattern of every neighbouring entry: `mcp-failed` reports that the local MCP server could not start, which the user must see even when the originating tab is active, and `question-withdrawn` reports the withdrawal of a pending question and must stay as visible as the `question` event it follows. Keep both classified as explicit, and leave their entries in `NOTIFICATION_ALERT_DEFAULTS` (`src/notifications/alert-defaults.ts`) and their cases in `notificationText` (`src/notifications/format.ts`) unchanged. The table-driven coverage test in `src/notifications/index.test.ts` already exercises every explicit event and must keep passing untouched, and the two rendering tests added in `src/notifications/format.test.ts` already pin both messages and must also stay untouched.
