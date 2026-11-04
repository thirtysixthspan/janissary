<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Functionality: handle rejected connections-list row actions and discard a delete confirmation once its row disappears.

Existing Issue: `web/src/plugins/connections/useConnectionsController.ts` fires `open` and `close` intents with `void capabilities.intent(...)`, so the `rejectRequest` that `src/plugins/connections/activate.ts` returns for a stale or invented owner becomes an unhandled rejection, and `web/src/plugins/connections/ConnectionList.tsx` keeps its `pendingDelete` row and dialog after a topic update removes that row. Severity: 5/10

Existing Risk: 5/10 - A user who confirms a delete after the record was removed gets no feedback and a console unhandled rejection, while a stale row click can fail silently, leaving the list's apparent control disconnected from the action it took.

Proposal Risk: 2/10 - The error path becomes visible, but a stale row still cannot be acted on; the fix deliberately preserves the server-authoritative rejection rather than retrying or trusting a client owner.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "make connections-list row actions handle stale rows and rejected intents". In `web/src/plugins/connections/useConnectionsController.ts`, route `open` and `close` through the same guarded path used by record actions so a rejected intent sets the existing `error` state instead of escaping as a rejected promise. In `web/src/plugins/connections/ConnectionList.tsx`, render that error with `role="alert"` and clear `pendingDelete` when no current row matches its `connectionRowIdentity`; keep the exact delete-confirmation wording and do not send an intent after the row has gone. Add cases in `web/src/plugins/connections/ConnectionList.test.tsx` for a rejected open and close (assert an inline message and no unhandled rejection) and for removing the pending-delete row before confirmation (assert no intent is sent). Preserve owner-aware identity, two-click behavior, control-only Enter handling, and the server's `rejectRequest` contract; do not retry or fabricate an owner.
