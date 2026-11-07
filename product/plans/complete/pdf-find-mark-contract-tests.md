# Pin the PDF find-mark mapping and highlight-name contracts

**Complexity: 2/10** — test-only, four focused cases in three existing test files. No production behavior changes are planned; the care is in building DOM layers that exercise the boundaries the existing helpers hide.

## Goal

Pin the four find-mark contracts that the current suite does not exercise: a page's final line when it ends without a trailing `<br>`, a match that starts or ends exactly on a text-node boundary, the current occurrence's line-relative `start` on a line with more than one occurrence, and the tie between the highlight-name constants and the `::highlight(...)` names in `pdf.css`. A regression in any of them should fail a test instead of silently dropping, misplacing, or hiding marks.

## Design decisions and dependencies

`pdf-find-04-match-marks` already landed `occurrencesInLayer`, `currentRange` inside `usePdfFindMarks`, and the two `::highlight` rules. `pdf-styles.test.ts` currently hard-codes the two selectors instead of deriving them from the constants, which is the only gap in the stylesheet tie. This subplan adds tests only and does not change behavior.

- The final-line case must build the layer directly. `layerWith` appends a `<br>` after every line, so `layerLines`' `if (text.length > 0) endLine()` fallback never runs in the existing suite. A layer with `span('alpha')`, a `<br>`, and `span('beta')` with no trailing `<br>` gives the fallback sole responsibility for the second line. The test asserts that occurrence's `line` is `1`, its `start` is `0`, and `range.toString()` is `'beta'`, so the assertion is about the line contract and not only about a chosen node.
- The boundary case uses adjacent spans `'ab'` and `'cd'` on one line. `startPoint` treats a text node as half-open, so query `'cd'` must start at offset `0` of the second node. `endPoint` uses `offset - 1`, so query `'ab'` must end at offset `2` of the first node, not at offset `0` of the second. Assert container and offset for both ends, plus the matched text.
- The same-line current case lives in `usePdfFindMarks.test.tsx` because `currentRange` is private to the hook. One page with the line `'xneedle needle'` produces occurrences at `start` 1 and 8. Setting `current` to `{ page: 0, line: 0, start: 8 }` puts the range at offset 8 in `PDF_FIND_CURRENT` and the range at offset 1 in `PDF_FIND_MATCH`. Both ranges cover the same text and start in the same text node, so only the offset assertions catch a `currentRange` that matches on line alone.
- The highlight-name contract belongs in `pdf-styles.test.ts`. Import `PDF_FIND_MATCH` and `PDF_FIND_CURRENT` and build the two expected selectors with template strings, replacing the hard-coded selector strings. A rename of either constant without the stylesheet, or a stylesheet rename without the constants, then fails the test.
- Keep production code unchanged. If a new case exposes a real mapping defect, fix only `occurrencesInLayer` or `currentRange` and record that in the completed plan; do not widen the change elsewhere.
- No spec or documentation update is needed: the behavior is unchanged, and the user-facing Find documentation is already owned by the draft `pdf-find-05-specs-docs-and-verification` plan.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Layer builder | `web/src/plugins/pdf/pdf-find-marks.test.ts` `layerWith` | Reused for the boundary case; the final-line case builds its element by hand because `layerWith` always adds a trailing `<br>`. |
| Highlight stub | `web/src/plugins/pdf/pdf-find-marks.test.ts` `stubHighlights` | Unchanged; the new pure cases do not need it. |
| Hook test helpers | `web/src/plugins/pdf/usePdfFindMarks.test.tsx` `addPage`, `textNode`, `marks` | Reused for the same-line current case. |
| Stylesheet selector helper | `web/src/plugins/pdf/pdf-styles.test.ts` `selectorsOf` | Reused; its existing highlight test gains the derived selectors. |
| Highlight constants | `web/src/plugins/pdf/pdf-find-marks.ts` `PDF_FIND_MATCH`, `PDF_FIND_CURRENT` | Imported by the styles test as the single source of the highlight names. |

## Proposed changes

- In `web/src/plugins/pdf/pdf-find-marks.test.ts`, add a final-line case and a text-node-boundary case under the `occurrencesInLayer` describe block.
- In `web/src/plugins/pdf/usePdfFindMarks.test.tsx`, add a same-line current-occurrence case.
- In `web/src/plugins/pdf/pdf-styles.test.ts`, import the two highlight-name constants and replace the hard-coded `::highlight(...)` strings with selectors built from them.
- Do not touch `pdf-find-marks.ts`, `usePdfFindMarks.ts`, `pdf.css`, or any other production file unless a new case fails for a real defect in `occurrencesInLayer` or `currentRange`.

## Tests

In `web/src/plugins/pdf/pdf-find-marks.test.ts`:

- A layer whose second and final line has no trailing `<br>` reports that line's occurrence with `line` 1, `start` 0, and `range.toString()` `'beta'`.
- With adjacent spans `'ab'` and `'cd'` on one line, `'cd'` starts at offset 0 of the second span's text node, and `'ab'` ends at offset 2 of the first span's text node rather than at the second node.

In `web/src/plugins/pdf/usePdfFindMarks.test.tsx`:

- With the line `'xneedle needle'` and `current` at `{ page: 0, line: 0, start: 8 }`, `PDF_FIND_CURRENT` holds the range at offset 8 and `PDF_FIND_MATCH` holds the range at offset 1, both starting in the line's text node.

In `web/src/plugins/pdf/pdf-styles.test.ts`:

- The expected `.pdf-text-layer ::highlight(...)` selectors are built from `PDF_FIND_MATCH` and `PDF_FIND_CURRENT`, so the constants and `pdf.css` cannot drift apart.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each edit.

Then run the focused tests and the incremental typecheck:

`npm run test:client -- web/src/plugins/pdf/pdf-find-marks.test.ts web/src/plugins/pdf/usePdfFindMarks.test.tsx web/src/plugins/pdf/pdf-styles.test.ts web/src/plugins/pdf/PdfTab.test.tsx`

`npm run typecheck:diff`

All 72 existing PDF find tests must stay green, and the new cases must fail if the corresponding mapping or name contract is broken.

## Out of scope

- Any production change unless a new case exposes a real defect in `occurrencesInLayer` or `currentRange`.
- PDF.js branches in `pdf-document.ts`, the overlay, the reveal, or the page renderer.
- User-facing Find documentation, which `pdf-find-05-specs-docs-and-verification` owns.
- New test helpers beyond the direct layer construction the final-line case needs.
