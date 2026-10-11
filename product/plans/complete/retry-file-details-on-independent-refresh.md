# Retry File Details on Independent Refresh

Complexity: 5/10

## Goal

Prevent a failed asynchronous row-detail read from scheduling an immediate replacement through the cache's rebuild callback.

## Approach

On stat success, update the cache and request a redraw as today. On failure, release the failed batch's in-flight markers under the existing generation guard and do not request a redraw. Missing details remain eligible for the next independent refresh. Preserve the documented retry behavior in `product/specs/file-navigator-tab.md`, which already says failed detail reads are requested again on the next refresh.

## Implementation steps

1. Change the rejected `fillStats` path in `src/file-navigator/filesystem-cache.ts` to clear its markers without calling `onReady`.
2. Add a production-shaped regression case in `src/file-navigator/filesystem-cache.test.ts` whose callback rebuilds the cache, then explicitly refresh and verify a successful retry fills the row.

## Tests

- Verify a rejected detail read settles once when the completion callback rebuilds.
- Verify an independent refresh retries the missing row and stores the successful result.
- Run `./scripts/run.mjs check-diff` after implementation and test changes.

## Out of scope

- Changing cache generation or synchronous filesystem behavior.
- Changing directory invalidation, watcher behavior, or public documentation.
- Rewording the file-navigator spec, which already states the retry contract.
