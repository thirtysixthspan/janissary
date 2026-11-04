# Handle refused connections-list row actions and discard stale delete confirmations

**Complexity: 3/10** — two small changes in the connections list controller and component, with focused component cases; row identity, selection, two-click opening, control-only Enter handling, and the server's rejection contract stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Functionality: handle rejected connections-list row actions and discard a delete confirmation once its row disappears."

Today `open` and `close` in `web/src/plugins/connections/useConnectionsController.ts` fire `capabilities.intent(...)` with `void`, while the record actions (`cancel`, `close-session`, `terminate`, `load-older`) await the intent and catch a refusal into the controller's existing `error` state. A stale or invented owner is refused by `src/plugins/connections/activate.ts` through `rejectRequest`, so the list's open or close becomes an unhandled rejection and the user sees no feedback. Separately, `ConnectionList` stores the whole record row in `pendingDelete`; when a topic update removes that row, the delete-confirmation dialog stays open, offers to delete a record that is gone, and sends a `close` intent for it if confirmed.

The fix routes `open` and `close` through the same guarded path as record actions, renders the resulting error inline in the list with `role="alert"`, and clears `pendingDelete` as soon as no current row matches its `connectionRowIdentity`. It deliberately keeps the server authoritative: a stale action is refused and reported, never retried, and no owner is fabricated. The delete dialog keeps its exact `Delete "<title>"?` wording, and once its row has gone it is gone too, so no intent can be sent for it.

## Approach and evidence

`useConnectionsController.act` already wraps a record intent in `setError(null)` / `try` / `catch`, keeps `pendingTerminate` false when a terminate is refused, and rethrows only `load-older` so its caller can restore the scroll viewport. Extracting that guard into a shared callback and calling it from `open` and `close` gives the list actions the same behavior without changing the record actions: a refusal sets `controller.error`, and the fire-and-forget call consumes the rejection instead of leaving it unhandled.

`ConnectionTab` already renders `controller.error` in a `role="alert"` element. `ConnectionList` does not render it at all, so its rows can fail silently. It also holds `pendingDelete` as a snapshot row; `connectionRowIdentity` already includes type, kind, id, and owner, and `connectionListOrder` / click confirmation use it to discard confirmations across reorders. An effect comparing the pending row's identity with the current rows gives the delete dialog the same treatment: the row leaving the list, or being replaced by a row with a different owner, clears the pending state and unmounts the dialog.

## Implementation steps

1. In `web/src/plugins/connections/useConnectionsController.ts`, extract the existing error-guarding behavior into a shared callback and use it for `open`, `close`, and the record actions. A refused `open` or `close` must set `error` and must not leave a rejected promise. Preserve the record actions' current behavior, including `pendingTerminate` reset and `load-older` rethrow.
2. In `web/src/plugins/connections/ConnectionList.tsx`, render `controller.error` in an inline element with `role="alert"` and clear `pendingDelete` when no current row has the same `connectionRowIdentity`. Keep the confirmation wording exactly `Delete "<title>"?` and keep `onConfirm` sending only the pending row's `close` intent.
3. Add the list error style to `web/src/plugins/connections/connections.css`.
4. Add the component cases listed under Tests to `web/src/plugins/connections/ConnectionList.test.tsx`.
5. In `product/specs/connections-tab.md`, state that a refused row action shows an inline error and that a pending delete confirmation is discarded when its row disappears or is replaced.
6. Run `$janissary/scripts/run.mjs check-diff`, then the focused client suite for `ConnectionList.test.tsx`.
7. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton because it is the only entry.

## Tests

- `ConnectionList.test.tsx`: a rejected row `open` shows the refusal message inline in a `role="alert"` element and leaves no unhandled rejection.
- `ConnectionList.test.tsx`: a rejected row `close` shows the refusal message inline in a `role="alert"` element and leaves no unhandled rejection.
- `ConnectionList.test.tsx`: opening the delete confirmation and then removing that row from the list discards the dialog and sends no intent, so a confirmation cannot act on a row that has gone.
- Existing cases continue to cover owner-aware identity, two-click opening, control-only Enter handling, and the exact delete wording.

## Out of scope

- Retrying a refused action, trusting a client-supplied owner, or changing `src/plugins/connections/activate.ts` and its `rejectRequest` contract.
- Open, close, and delete intent payloads, row identity, selection, ordering, two-click behavior, and keyboard handling.
- The connection tab's own error surface, other list surfaces, help pages, and user documentation.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Extracted the record actions' error guard in `useConnectionsController` and routed `open` and `close` through it, so a refused row action sets the existing error state and leaves no unhandled rejection.
- Rendered that error inline in `ConnectionList` with `role="alert"` and a matching list error style.
- Cleared `pendingDelete` when no current row has its `connectionRowIdentity`, so the exact `Delete "<title>"?` confirmation disappears and cannot send an intent for a row that has gone.
- Added three component cases: refused open, refused close, and a pending delete whose row disappears before confirmation.
- Focused client suite passed for `ConnectionList.test.tsx` (19 tests); `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and web tests.
- Updated `product/specs/connections-tab.md` for the inline refusal and discarded stale confirmation.
- No help or user-documentation change: neither documents what happens to a row action or confirmation after its row disappears.
- Removed only the resolved backlog entry and restored the file's comment-and-heading skeleton.
