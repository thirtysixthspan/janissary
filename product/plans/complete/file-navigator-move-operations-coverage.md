# File navigator move-operation coverage

Complexity: 5/10

## Goal

Cover the file navigator move hook's conflict state machine so scalar moves, batch moves, and history replay all preserve their retry and cancellation behavior.

## Approach

Use colocated React hook tests with a mocked `JanusClient`. Resolve each conflict-producing request, assert the pending conflict variant and user-facing title, then exercise the matching overwrite/skip retry or cancellation path and verify the emitted RPC.

## Implementation steps

1. Add `useFileNavigatorMoveOperations.test.ts` with scalar move, batch move, scalar history, and batch history scenarios.
2. Run the focused and diff-scoped web checks.
3. Promote this plan to `product/plans/complete/` and remove the resolved backlog entry.

## Tests

The new tests cover four conflict variants/paths, including scalar move retry and cancellation, batch move policy retry, scalar history retry, and batch history cancellation.

## Out of scope

Do not change RPC implementation, conflict policy semantics, or UI rendering.
