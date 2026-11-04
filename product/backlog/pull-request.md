<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Technical debt: release a loaded record window when its connection tab closes instead of retaining it in every connections delivery for the manager's lifetime.

Existing Issue: `src/plugins/connections-topic.ts` keeps every loaded record id in `requestedWindows` for the lifetime of the `Managers` instance, and `src/plugins/connections-topic-rows.ts` removes an id only when the record itself disappears, so after a connection tab closes every later `connections:changed` or `state:dirty` delivery still includes that record's full prompt window even though no tab displays it. Severity: 5/10

Existing Risk: 5/10 - Opening several long records permanently enlarges every coalesced topic delivery, including the list tab's payload, and keeps prompt and activity text flowing to every plugin that subscribes to connections.

Proposal Risk: 2/10 - Releasing a window while its tab remains open would leave the record tab on `Loading connection history…` until a reload, so the release must depend on tab closure and be tested against reopening and paging.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "release requested connection record windows when their tabs close". In `src/plugins/connections-topic-rows.ts`, extend `composeConnectionsTopicData` to prune `requestedWindows` entries whose record id has no open plugin tab: build the open set from `managers.tab.tabs` entries carrying `plugin.instanceKey`, and keep only requested ids present in both `managers.acpRecords.rows()` and that open set. Do not prune a window while its record tab is open, including while docked or hidden, and preserve the existing absent-record pruning and the `load` reset and `loadOlder` cap behavior. Add coverage in `src/plugins/connections-topic-rows.test.ts` and `src/plugins/connections-topic.test.ts`: load a record and assert its window is present, remove its plugin tab from the manager's tab list and assert the next read has no `window`, reopen and assert a fresh 20-block window, and confirm an unrequested record still has no window and paging still works. Keep the topic action list unchanged; the tab set is host-owned state the topic already composes from.


* Functionality: handle rejected connections-list row actions and discard a delete confirmation once its row disappears.

Existing Issue: `web/src/plugins/connections/useConnectionsController.ts` fires `open` and `close` intents with `void capabilities.intent(...)`, so the `rejectRequest` that `src/plugins/connections/activate.ts` returns for a stale or invented owner becomes an unhandled rejection, and `web/src/plugins/connections/ConnectionList.tsx` keeps its `pendingDelete` row and dialog after a topic update removes that row. Severity: 5/10

Existing Risk: 5/10 - A user who confirms a delete after the record was removed gets no feedback and a console unhandled rejection, while a stale row click can fail silently, leaving the list's apparent control disconnected from the action it took.

Proposal Risk: 2/10 - The error path becomes visible, but a stale row still cannot be acted on; the fix deliberately preserves the server-authoritative rejection rather than retrying or trusting a client owner.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "make connections-list row actions handle stale rows and rejected intents". In `web/src/plugins/connections/useConnectionsController.ts`, route `open` and `close` through the same guarded path used by record actions so a rejected intent sets the existing `error` state instead of escaping as a rejected promise. In `web/src/plugins/connections/ConnectionList.tsx`, render that error with `role="alert"` and clear `pendingDelete` when no current row matches its `connectionRowIdentity`; keep the exact delete-confirmation wording and do not send an intent after the row has gone. Add cases in `web/src/plugins/connections/ConnectionList.test.tsx` for a rejected open and close (assert an inline message and no unhandled rejection) and for removing the pending-delete row before confirmation (assert no intent is sent). Preserve owner-aware identity, two-click behavior, control-only Enter handling, and the server's `rejectRequest` contract; do not retry or fabricate an owner.
