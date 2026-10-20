# PR 1760 — stream local search results as they resolve

Complexity: 3/10

## Goal

Local searches currently wait until every file in a 64-file detection batch has been read and checked before showing any match from that batch. Publish rows as each file resolves, while keeping file-path order, the existing read-concurrency bound, cancellation behavior, and the 250-row cap.

## Approach

Replace the local scan's separate batch-wide detection and delivery phases with an ordered pipeline. Keep up to eight candidate checks in flight, consume their outcomes in path order, and publish each matching file's rows as soon as all earlier candidates have resolved. Continue to begin the next 64-file batch only after the current batch is consumed, so the existing result cap does not trigger reads from a later batch. Remote scanning is already streamed and remains unchanged.

## Implementation steps

1. Refactor local scanning in `src/plugins/search/scan.ts` to check candidates concurrently within each existing batch and deliver each matching file immediately in path order.
2. Add a regression test in `src/plugins/search/scan.test.ts` proving an early matching file is published while a later read in the same batch remains pending. Keep coverage for ordering, cancellation, and the result cap.
3. Update `product/specs/search-tab.md` to state that local results appear as matching files resolve, without waiting for the rest of their current scan group.

## Tests

- A gated read after an early matching file must not delay that file's first row batch.
- Existing local path-order, cancellation, error, filtering, and 250-row cap tests continue to pass.
- Existing remote streaming tests continue to pass unchanged.

## Out of scope

- Changing remote workspace scan behavior or read concurrency.
- Changing the displayed result ordering, result cap, or UI presentation.
- Changing help text or user documentation, which does not describe this scan timing detail.
