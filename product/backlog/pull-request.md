<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the fix plan's one-to-one highlight-name contract by pinning each find-mark constant to its own `::highlight` selector, not just to the set of selector names.

Existing Issue: The new stylesheet test derives both expected selectors from `PDF_FIND_MATCH` and `PDF_FIND_CURRENT`, so it only proves that each value appears somewhere in `pdf.css` and never proves that `PDF_FIND_MATCH` names the match rule and `PDF_FIND_CURRENT` names the current rule; swapping the two constant values passes the new test and every existing find-mark test while `paintMarks` paints the current occurrence with the 20% match color and every other match with the 45% current color. Severity: 4/10

Existing Risk: 4/10 - A swapped pair of constants ships silently and the highlighted row's occurrence becomes weaker than every other mark, while the suite added to guard the names still passes, so the regression surfaces only in manual use.

Proposal Risk: 1/10 - The constants and stylesheet are tied one-to-one, so a swap or same-value collapse fails, a deliberate coordinated rename updates the test in the same change, and no production behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "pin each find highlight constant to its own ::highlight selector". In `web/src/plugins/pdf/pdf-styles.test.ts`, keep the existing derived `toContain` checks for the two selectors and add literal assertions that `PDF_FIND_MATCH` is `pdf-find-match` and `PDF_FIND_CURRENT` is `pdf-find-current` (or assert the two constants are distinct and map each to its literal selector), so a swap of the two values or a same-value collapse fails while a deliberate coordinated rename still requires updating the test. Do not change `web/src/plugins/pdf/pdf-find-marks.ts`, `web/src/plugins/pdf/pdf.css`, or any production file; the current values and stylesheet are correct. The existing `paintMarks` cases in `web/src/plugins/pdf/pdf-find-marks.test.ts` and the hook and tab mark tests must stay green. Verify by temporarily swapping the two constant values in `pdf-find-marks.ts`, confirming `web/src/plugins/pdf/pdf-styles.test.ts` fails, restoring the exact values, then running the fix plan's focused command for the four PDF find test files and `npm run typecheck:diff`.
