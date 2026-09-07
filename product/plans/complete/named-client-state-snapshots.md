# Pass shared named snapshots to state subscribers

**Complexity: 3/10.** A type and subscription boundary refactor.

## Goal

Remove the duplicated positional state contract while preserving every displayed field, dialog default, route selection, and project title.

## Approach

Use the shared `StateEvent` for `StateListener`. Forward a named snapshot from `JanusClient`, normalizing absent route and launch dialogs to null as before. Destructure fields in `useServerState` and remove the fallback for the required active-tab name limit.

## Implementation steps

1. Update `web/src/ws.ts` and `web/src/useServerState.ts`, together with affected fixtures and existing assertions in `ws.test.ts`, `useServerState.test.ts`, and `App.test.tsx`. Run check-diff.
2. Add complete-snapshot fan-out and null-normalization regression cases to the websocket and hook tests. Verify distinct strings, numeric limits, optional secondary selection, route initialization, and title updates. Run check-diff.
3. Record observable snapshot behavior in `product/specs/websocket-rpc.md`. Existing help and public documentation require no change because behavior is preserved. Promote this plan, remove the resolved backlog entry, run check-diff, and ship through the merge workflow.

## Tests

Verify a complete named snapshot reaches subscribers and each corresponding setter with distinct values. Verify absent and explicitly null dialogs remain closed, optional secondary selection clears, and project directory and version produce the expected title. Preserve route-choice and app integration coverage.

## Out of scope

App state storage, setter abstraction, runtime frame validation, shared protocol changes, and unrelated client subscriptions.
