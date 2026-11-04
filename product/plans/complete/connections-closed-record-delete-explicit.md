# Make closed-record deletion explicit and refuse a stale close

**Complexity: 3/10** — one server branch, one controller operation, one component call site, and focused tests; the delete protocol, row identity, confirmation wording, and error surface stay unchanged.

## Goal

Resolve PR #1916's recorded finding: "Functionality: refuse a stale connections-list Close on a record that has since closed, and reserve deletion for the confirmed Delete control."

Today the list's Close button and its confirmed Delete dialog both send the same `close` intent. `src/plugins/connections/activate.ts` re-resolves that intent against current topic data and, when the record is no longer `Idle` or `Running`, sends the `delete` topic action. A Close that arrives after the session closed, including a double click or a click during the topic coalescing window, therefore deletes retained ACP history without the required `Delete "<title>"?` confirmation.

The fix gives deletion its own intent from the confirmed dialog and makes a record Close valid only while the freshly resolved row is still `Idle` or `Running`. Any other record Close is refused with the existing `invalid close payload` error and invokes no topic action. Only the confirmed Delete control can delete.

## Approach and evidence

`web/src/plugins/connections/useConnectionsController.ts` already has a `guarded` callback that clears the prior error, awaits the intent, records a refusal in `error`, and consumes the rejection. `act` uses it for the record actions. Adding `delete` to that action set and exposing a `delete` operation gives the dialog the same error handling without a second path.

`web/src/plugins/connections/ConnectionList.tsx` limits the Delete control to closed ACP records and keeps the exact `Delete "<title>"?` wording. Its `onConfirm` currently calls `controller.close(pendingDelete)`, which is the shared path that can delete without confirmation on the server. Calling the new `controller.delete(pendingDelete.id)` sends the id-only `delete` intent instead.

`src/plugins/connections/activate.ts` resolves `open`/`close` by owner against current topic data before calling `openOrClose`, so the row status is fresh at decision time. Its record branch sends `closeSession` for `Idle` or `Running` and currently falls through to `delete` otherwise. Replacing that fallthrough with `capabilities.rejectRequest('invalid close payload')` leaves live-row close unchanged and reserves the topic `delete` action for `recordAction`'s existing `delete` arm. The list already renders `controller.error` inline with `role="alert"`, so a refused stale Close is reported without deleting anything.

## Implementation steps

1. In `web/src/plugins/connections/useConnectionsController.ts`, include `delete` in the controller action set and expose a `delete` operation that awaits `capabilities.intent('delete', { id })` through `guarded`.
2. In `web/src/plugins/connections/ConnectionList.tsx`, call the new delete operation from the confirmation dialog's `onConfirm` instead of `close`. Keep the Delete control limited to closed ACP records and keep the exact `Delete "<title>"?` wording unchanged.
3. In `src/plugins/connections/activate.ts`, make the record branch of a `close` intent send `closeSession` only when the freshly resolved row is `Idle` or `Running`; otherwise reject with the existing `invalid close payload` message and invoke no topic action. Leave `recordAction`'s `delete` arm as the only path to the topic `delete` action.
4. Add the server cases listed under Tests to `src/plugins/connections/activate.test.ts` and the list cases to `web/src/plugins/connections/ConnectionList.test.tsx`.
5. In `product/specs/connections-tab.md`, state that a Close on a record that has since closed is refused and only the confirmed Delete deletes.
6. Run `$janissary/scripts/run.mjs check-diff` and the focused server and client suites for the changed tests.
7. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining entry.

## Tests

- `src/plugins/connections/activate.test.ts`: a `close` intent whose freshly resolved record is `Closed` rejects with `invalid close payload` and calls no topic action, even when the client's tab payload still says `Running`.
- `src/plugins/connections/activate.test.ts`: an explicit `delete` intent on a terminal record passes through as the topic `delete` action, which the existing `src/plugins/connections-topic.test.ts` case proves reaches `acpRecords.delete`.
- `web/src/plugins/connections/ConnectionList.test.tsx`: confirming `Delete "<title>"?` sends `delete` with the record id and never sends `close`.
- `web/src/plugins/connections/ConnectionList.test.tsx`: a Close refused because the record has since closed shows the error inline, sends no `delete` intent, and leaves no unhandled rejection.
- Existing cases continue to cover the exact confirmation wording, control-only Enter handling, owner-aware row identity, and inline refusals.

## Out of scope

- Changing the `delete` intent payload, the topic `delete` action, or `acpRecords.delete` ownership and terminal-status checks.
- Deleting an open record, trusting a client-supplied status, retrying a refused Close, or adding another confirmation path.
- Row identity, selection, ordering, two-click opening, and keyboard handling.
- Connection-tab controls, other list surfaces, help pages, user documentation, and the pull request description.
- Other backlog entries, merge, history rewriting, and the pull request title.

## Completion

- Added a `delete` operation to `useConnectionsController` that awaits `capabilities.intent('delete', { id })` through the existing `guarded` error path.
- `ConnectionList` now sends that delete intent from the confirmed dialog instead of `close`, keeping the Delete control limited to closed ACP records and the `Delete "<title>"?` wording unchanged.
- `activate.ts` now sends `closeSession` only for a freshly resolved `Idle` or `Running` record and refuses every other record Close with the existing `invalid close payload` message without a topic action; the `recordAction` `delete` arm is the only delete path.
- Added activation cases for a stale closed Close and an explicit terminal delete, and list cases for confirmation sending `delete` and a refused stale Close sending no delete.
- Updated `product/specs/connections-tab.md` to state that a stale Close is refused and only the confirmed Delete deletes.
- No help or user-documentation change: both already describe an open row's Close and a closed row's confirmed Delete, and neither documents a stale Close.
- Removed only the resolved backlog entry, preserving the remaining plan-fidelity entry.
