# Tab close release failure containment

Complexity: 5/10

## Goal

Ensure a failure while closing a tab does not prevent independent resources and served-file references from being released, and make all cleanup failures observable to the caller.

## Approach

Keep tab removal and focus changes synchronous, and preserve the manager release order and deferred workspace deletion. Accumulate failures from synchronous cleanup steps, message-bus listeners, and the deferred workspace release, then reject the resource-release promise with one `AggregateError` after all work settles. Expose listener failures as the return value of `MessageBus.emit` without changing its failure-isolation behavior.

## Implementation steps

1. Update `MessageBus.emit` to return listener exceptions while continuing to notify its error sink and remaining listeners.
2. Update `closeTabResources` to attempt every independent cleanup action and reject once with all collected failures, attaching a rejection handler to deferred workspace removal immediately.
3. Add tests for manager, transcript-listener, workspace-release failures, reference isolation, and visible close/focus behavior.
4. Update `product/specs/tabs.md`, promote this plan to complete, and remove the resolved backlog item.

## Tests

- In `src/tab/cleanup.test.ts`, prove an early manager failure does not stop later managers, busy cleanup, transcript notification, and file-reference release; assert the returned error contains the failure.
- In `src/tab/cleanup.test.ts`, prove transcript-listener failures and deferred workspace-release failures are included in the returned aggregate while unrelated served-file references survive.
- In `src/controller.test.ts`, prove a cleanup failure does not prevent tab removal or focus restoration.
- Run `./scripts/run.mjs check-diff` after each implementation step and after test and spec/backlog updates.

## Out of scope

- Changing the manager release order or making workspace deletion synchronous.
- Changing application shutdown behavior.
- Reporting cleanup failures through a new user-facing UI.
