# Limit quick open to the top 10 candidates

**Complexity: 1/10** — a single constant change; the ranking, capping, and rendering pipeline already exists and just takes the limit as a parameter.

## Goal

The Cmd+P quick-open overlay currently ranks and shows up to 100 fuzzy-matched candidates. It should show at most the top 10 best-scoring matches.

## Approach

`useQuickOpen.ts` defines `RESULT_CAP = 100` and passes it straight through to `fuzzyMatch(paths, deferredQuery, RESULT_CAP)`, which already slices to the best `limit` matches after sorting by score. Lowering the constant to `10` is sufficient — no other code depends on the value of 100.

## Implementation steps

1. `web/src/useQuickOpen.ts` — change `const RESULT_CAP = 100;` to `const RESULT_CAP = 10;`.

## Tests

- `web/src/useQuickOpen.test.ts` — add a test that seeds more than 10 matching paths and asserts `quickOpenResults` is capped at 10 and holds the best-scoring ones.

## Spec

- `product/specs/quick-open.md` — the "Filtering" section says "The list is capped to the best-scoring matches" without a number; update it to say the top 10.

## Out of scope

- Changing the underlying `fuzzyMatch` ranking/scoring logic — only the cap passed to it changes.
- Any UI affordance for scrolling/paging past the cap.
