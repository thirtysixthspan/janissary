# Pin each PDF find highlight constant to its own selector

**Complexity: 4/10** — a test-only change in one file. The care is choosing an assertion that binds each constant to its literal selector name without duplicating the stylesheet check, then proving the guard fails on the regression it names.

## Goal

Make swapping `PDF_FIND_MATCH` and `PDF_FIND_CURRENT` fail a test. Today `pdf-styles.test.ts` derives both expected selectors from the constants, so it proves each value appears somewhere in `pdf.css` but not that each constant names its own rule. A swap paints the current occurrence with the weaker match color and every other match with the current color while the suite stays green.

## Design decisions and dependencies

The constants and the stylesheet are already correct: `pdf-find-marks.ts` declares `PDF_FIND_MATCH = 'pdf-find-match'` and `PDF_FIND_CURRENT = 'pdf-find-current'`, and `pdf.css` styles `.pdf-text-layer ::highlight(pdf-find-match)` and `.pdf-text-layer ::highlight(pdf-find-current)`. No production file changes.

- Keep the existing derived `toContain` checks in `web/src/plugins/pdf/pdf-styles.test.ts`. They remain the tie between the constants and the stylesheet: a rename on one side alone fails them.
- Add one focused test asserting `PDF_FIND_MATCH` is `pdf-find-match` and `PDF_FIND_CURRENT` is `pdf-find-current`. A swap fails both assertions, a same-value collapse fails at least one, and a deliberate coordinated rename fails the literal assertions until the test records the new names.
- Leave the two literal names in the new test rather than deriving them from anything. That is the point: the test, not the code, states which constant owns which rule.
- The existing `paintMarks`, hook, and `PdfTab` mark tests stay untouched and must remain green. They prove painting uses the constants, while this test proves the constants have the names the stylesheet targets.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Highlight constants | `web/src/plugins/pdf/pdf-find-marks.ts` | Imported by the styles test; values pinned literally. |
| Stylesheet selectors | `web/src/plugins/pdf/pdf.css` | Already correct; asserted by the derived checks. |
| Derived selector test | `web/src/plugins/pdf/pdf-styles.test.ts` "styles both find highlights on the text layer" | Kept as-is; the new test sits beside it. |

## Proposed changes

- In `web/src/plugins/pdf/pdf-styles.test.ts`, add one test under the existing `the PDF plugin stays inside its own tab` describe block asserting the two constants equal their literal selector names.
- Do not change `web/src/plugins/pdf/pdf-find-marks.ts`, `web/src/plugins/pdf/pdf.css`, or any other production file.

## Tests

In `web/src/plugins/pdf/pdf-styles.test.ts`:

- `PDF_FIND_MATCH` equals `pdf-find-match`.
- `PDF_FIND_CURRENT` equals `pdf-find-current`.

Together with the existing derived `toContain` checks, these fail on a swap of the two constant values, on a same-value collapse, and on a one-sided rename.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the edit.

Confirm the guard catches the named regression: temporarily swap the two constant values in `pdf-find-marks.ts`, run the styles test alone, and confirm it fails. Restore the exact original values, then run the focused four-file command:

`npm run test:client -- web/src/plugins/pdf/pdf-find-marks.test.ts web/src/plugins/pdf/usePdfFindMarks.test.tsx web/src/plugins/pdf/pdf-styles.test.ts web/src/plugins/pdf/PdfTab.test.tsx`

`npm run typecheck:diff`

All 75 existing PDF find tests plus the new one must pass with the constants restored, and the working tree must contain no change to `pdf-find-marks.ts`.

## Out of scope

- Changing the constants or the stylesheet.
- Any production file.
- New helpers or a broader restructure of `pdf-styles.test.ts`.
- The PDF spec and user-facing Find documentation, which the branch's Find work owns separately.
