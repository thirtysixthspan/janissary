# Default menu deferred replies

## Complexity

2/10.

## Goal

Deliver the plan's deferred-response regression tests for the default menu.

## Approach

Use the controlled promise helper in `web/src/context-menu/DefaultContextMenu.test.tsx` to exercise actual pending replies, based on the selection-action hook fixture. Await every controlled resolution and the corresponding React update. Preserve the existing immediate-response and clear-between-menu tests.

## Implementation steps

1. Add dismissal-before-reply, reverse-order reply, and claimed-surface cases. Run `./scripts/run.mjs check-diff`.
2. Describe stale reply behavior in `product/specs/context-menu.md`, promote the plan, remove the resolved entry, check and push the PR branch.

## Tests

A menu dismissed before its response stays closed after resolution and sends no action. Two menus use distinguishable selections and replies; the second reply arrives first, the older reply cannot replace it, and activation sends only the second selection and action. A claimed surface with a client makes no contribution request.

## Out of scope

Production changes unless the regression reveals a failure, other backlog entries, public documentation additions, and merging. No new comments.
