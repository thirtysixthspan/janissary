# Map case-insensitive PDF matches to original text offsets

**Complexity: 7/10** — this change must preserve UTF-16 source positions while matching on lowercased text in both result rows and PDF text layers. It touches shared matching, PDF DOM ranges, their regression tests, and the PDF behavior spec.

## Goal

Case-insensitive PDF find results and page marks must emphasize the complete original substring at its source position, even when lowercasing a preceding character changes the transformed text length.

## Approach

Keep matching against the same whole-string lowercase text, but carry a map from each transformed UTF-16 code unit back to the original character's UTF-16 range. `contiguousMatch` serves the editor, shell, and PDF find overlays, so its result-row highlighting will be corrected in all three. Client tab plugins cannot import core shared modules under the enforced plugin boundary, so the PDF text-layer matcher will keep a small local mapper with the same range semantics instead of widening the published plugin API. If a match lands within a multi-unit lowercase expansion, map it to the complete original character range.

## Implementation steps

1. Add the lowercase-to-source offset helper in `web/src/shared/fuzzy-match.ts` and use it in `contiguousMatch` so scores and highlight ranges use original text positions.
2. Add a local lowercase-to-source offset mapper in `web/src/plugins/pdf/pdf-find-marks.ts` and use it so DOM ranges and occurrence starts use original text positions, including across spans.
3. Add the shared matcher regression case in `web/src/shared/fuzzy-match.test.ts`.
4. Add the PDF text-layer regression case in `web/src/plugins/pdf/pdf-find-marks.test.ts`.
5. Update `product/specs/editor-tab.md` and `product/specs/pdf-tab.md` to state that case-insensitive matches emphasize the full original text when lowercasing changes length. The shell spec already defines matching in terms of the editor's behavior.
6. Update the existing find descriptions in `documentation/user-documentation/tab-types/editor.md` and `documentation/user-documentation/tab-types/pdf-viewer.md`; both already describe highlighted match text.
7. Run `./scripts/run.mjs check-diff` after each implementation and test step and after each spec and user documentation update.

## Tests

- In `web/src/shared/fuzzy-match.test.ts`, `contiguousMatch(['İneedle'], 'needle', 10)` returns the original range `[1, 7]`, whose slice is `needle`.
- In `web/src/plugins/pdf/pdf-find-marks.test.ts`, a layer containing `İneedle` returns a `needle` range starting at source offset 1 and ending at offset 7.
- Keep existing ASCII, cross-span, overlapping-occurrence, and line-boundary cases passing.

## Out of scope

- Changing fuzzy subsequence matching, query parsing, PDF line boundaries, result ranking, or the number of results.
- Help pages and the pull request description; neither describes how match highlights map back to original text.
