# Stop highlighting matched segments in quick search

**Complexity: 2/10** — delete a render helper and its two call sites in one component; no scoring, ranking, or data-model changes.

## Goal

The Cmd+P quick-open file finder (`web/src/QuickOpen.tsx`) currently wraps the matched characters of each candidate's filename and directory in `<mark>` elements. Per the backlog request, quick search should no longer highlight the matching segments of a candidate — each row should render its filename and directory as plain text.

## Approach

`QuickOpenRow` (`web/src/QuickOpen.tsx:34-44`) calls a helper, `highlightSlice` (`web/src/QuickOpen.tsx:19-32`), that walks `result.ranges` (a `[start, end][]` array from `FuzzyMatchResult`, computed in `web/src/fuzzy-match.ts`) and wraps matched substrings in `<mark>`. Removing the highlight means `QuickOpenRow` should render `name` and `dir` as plain strings instead of calling `highlightSlice`, and the now-unused `highlightSlice` function should be deleted.

`FuzzyMatchResult.ranges` and the range-collection logic in `fuzzy-match.ts` stay as-is — they are an internal detail of the scoring/ranking algorithm (used to build the ranges in the first place) and are exercised independently by `fuzzy-match.test.ts`; removing the UI's use of them is not a reason to also change the matching module.

## Implementation steps

1. In `web/src/QuickOpen.tsx`, delete the `highlightSlice` function (lines 16-32, including its header comment).
2. In `QuickOpenRow`, replace `highlightSlice(name, result.ranges, basenameStart)` with plain `name`, and `highlightSlice(dir, result.ranges, 0)` with plain `dir`.

## Tests

- `web/src/QuickOpen.test.tsx` has an existing test ("renders capped ranked rows with filename, dimmed path, and highlighted characters") that asserts `document.querySelectorAll('.quick-open-row mark').length > 0`. Update this test (and its name) to assert instead that no `<mark>` elements are rendered, while still asserting the filename/directory text content renders correctly.

Run `./scripts/run.mjs check-diff` to confirm.

## Spec updates

- `product/specs/quick-open.md` ("Filtering" section) — currently says "Each row shows the matched filename with the matched characters highlighted, and its containing directory dimmed beside it." Update to remove the "matched characters highlighted" claim.

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither documents match highlighting in quick open. No update needed.

## Out of scope

- `fuzzy-match.ts`'s range computation, scoring, or ranking behavior — unchanged.
- The separate file-search-popup (`FileSearchPopup.tsx`), which has its own `> `-prefix behavior already fixed by a prior issue and does not implement highlighting.
- The candidate-count cap in quick search (a separate backlog issue).
