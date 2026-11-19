# Correct the harness spec's Tab-completion wording

**Complexity: 1/10** — documentation-only: one sentence in `product/specs/harness.md`, no production code, no tests (p=2.47).

## Goal

Make the "New harness launch dialog" Model paragraph in `product/specs/harness.md` describe what `Tab` actually does in the model search input: it completes a single match, or fills the longest common prefix when several models match. The paragraph currently says "`Tab` completes the highlighted match," which is not what the shared input does.

## What the code actually does

`completeModel(ids, text)` in `web/src/shared/model-search/model-search.ts` finds the contiguous matches for the typed text, then:

- with exactly one match, inserts that model id;
- with several matches, inserts the longest common prefix of all matches, and inserts nothing when that prefix is no longer than what was typed;
- never reads the highlighted dropdown row.

`documentation/user-documentation/tab-types/roles.md` already describes this accurately for the same shared input: "`Tab` completes a single match or a common prefix".

## Approach

Rewrite only the `Tab` clause of the Model paragraph sentence. Leave the rest of the paragraph, the input, its keyboard handling, and all tests untouched.

## Implementation steps

1. In `product/specs/harness.md`, under "New harness launch dialog", change "`Tab` completes the highlighted match" to "`Tab` completes a single match, or fills the longest common prefix when several match". Leave every other sentence and paragraph byte-for-byte.

## Tests

None — documentation-only; no behavior changes and no new tests are needed. Verify the existing model-search completion tests still pass with `$janissary/scripts/run.mjs check-diff`.

## Spec

This fix is itself a spec change: `product/specs/harness.md` is the file updated. No other spec changes.

## Out of scope

- No change to the model search input, its keyboard handling, or the ModelSearchInput tests.
- No change to `documentation/user-documentation/tab-types/roles.md` — it is already accurate.
- No change to the pull request description — the entry does not call for one.

## Verification

Read the rewritten sentence against `documentation/user-documentation/tab-types/roles.md` and against `completeModel` in `web/src/shared/model-search/model-search.ts`, confirming it covers both the single-match and multi-match cases. Run `$janissary/scripts/run.mjs check-diff` to confirm no regression.
