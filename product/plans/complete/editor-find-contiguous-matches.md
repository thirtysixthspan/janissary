# Require contiguous characters in editor find

**Complexity: 3/10** — add a contiguous matcher beside the existing shared fuzzy matcher and use it only in editor find. Other fuzzy pickers keep their current behavior.

## Goal

Editor find returns a line only when the query appears as one contiguous, case-insensitive sequence in that line.

## Approach

Add `contiguousMatch` to the shared matcher module. It returns the same ranked result shape, scores exact spans using the existing filename and boundary bonuses, and records each match as one highlight range. Switch `useEditorFind` to this helper while leaving Quick Open on `fuzzyMatch`.

## Implementation steps

1. Implement and unit-test `contiguousMatch`, including case-insensitive matches, noncontiguous rejection, ranking, and a single highlight range.
2. Run `./scripts/run.mjs check-diff`.
3. Use `contiguousMatch` in editor find and add an integration test that rejects a subsequence with gaps.
4. Run `./scripts/run.mjs check-diff`.
5. Update the editor spec and user guide, then run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/shared/fuzzy-match.test.ts`: the contiguous helper accepts an exact span regardless of case, rejects gaps, ranks matches with existing bonuses, and returns one exact highlight range.
- `web/src/editor/EditorTab.test.tsx`: editor find shows no result when the query characters only occur as a subsequence.

## Out of scope

- Changing Quick Open or any other consumer of `fuzzyMatch`.
- Changing editor find's ten-result cap, ranking, or scrolling behavior.
