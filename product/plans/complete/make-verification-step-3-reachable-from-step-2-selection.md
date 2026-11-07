# Make verification Step 3 reachable from the row Step 2 leaves selected

**Complexity: 1/10** — a one-sentence correction to the pull request's own description, made after the push. No code, no tests, no spec, and no documentation. The care is in confirming which row is selected when Step 3 begins, and in preserving every other paragraph of the body.

## Goal

Step 3 of the pull request's "How to verify" section tells the reviewer to press `Down` until the row labelled `3` is highlighted. But Step 2 ends by clicking the row labelled `1`, and that's the last of the three ranked rows. `Down` clamps at the last row, so the selection never moves and page 3 never appears. The fix is to tell the reviewer that Step 2 left the last row highlighted and that one `Up` press reaches the row labelled `3`. Step 3's expectations stay as written.

## Why one Up works

- `web/src/plugins/pdf/usePdfFind.ts` passes the document's line texts to `useLineFind`, which ranks them with `contiguousMatch`.
- `contiguousMatch` in `web/src/shared/fuzzy-match.ts` sorts by score, then by shorter line, then by text, then by index. Each `quick brown fox` occurrence follows a space and sits in a line with no `/`, so all three score the same. The tie falls to length: page 2's `The quick brown fox appears again.` (34 characters), page 3's `Another quick brown fox waits here.` (35), and page 1's `The quick brown fox meets another quick brown fox.` (50). The rows rank page 2, page 3, page 1. The backlog entry gave page 1's line as 52 characters; it is 50, which changes nothing about the order.
- Clicking a row in `web/src/shared/line-find/LineFind.tsx` calls `onChangeSelected(row)`, which `PdfTab` wires to `usePdfFind.select`. So Step 2's click on the row labelled `1` sets the selection to index 2, the last row. The row's `onMouseDown` prevents default, so the input keeps focus and the arrow keys still reach it.
- `web/src/shared/ranked-overlay-keys.ts` moves `ArrowUp` to `Math.max(0, selected - 1)` and `ArrowDown` to `Math.min(count - 1, selected + 1)`. From index 2, `Down` stays put and one `Up` selects index 1, the row labelled `3`, whose reveal shows page 3.

## Relation to the earlier fix

`product/plans/complete/correct-the-up-direction-in-verification-step-3.md` changed Step 3 from `Up` to `Down` on the premise that the selection was on the first row when Step 3 began. That premise held for the selection `useLineFind` sets when the query changes, but Step 2's closing click on the row labelled `1` moves the selection to the last row before Step 3 starts. That click invalidates the earlier premise, so `Down` is wrong here and a single `Up` is right.

## Implementation steps

1. After the push, read the current body with `gh pr view 1958 --json body` and write the revised body to `./temp/pr-body.md`.
2. In the "How to verify" happy-path Step 3, replace "Do: press `Down` until the row labelled `3` is highlighted." with "Do: Step 2's click left the row labelled `1` highlighted, and it is the last row. Press `Up` once to highlight the row labelled `3`."
3. Leave Step 3's `Expect:` text, Step 2, and every other paragraph, heading, and the title byte-for-byte unchanged.
4. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md` and confirm the PR is still `OPEN` on `feature/pdf-tab-find`.

## Tests

None, and none possible: the artifact is prose in a pull request body. Row clicks, arrow movement, and the reveal and readout are already covered by `web/src/plugins/pdf/PdfTab.test.tsx`. `$janissary/scripts/run.mjs check-diff` must stay clean so the push carries no unintended change.

## Specs and documentation

No spec change: `product/specs/pdf-tab.md` § Find already says the arrows highlight a row and move the view to that match. No help or user-documentation change: neither describes this verification recipe.

## Out of scope

- Changing any code or test.
- Changing Step 2, Step 3's `Expect:` text, or any other verification step, including Steps 12 and 25 covered by other backlog entries.
- Changing the summary, What section, behavior examples, screenshots note, or title.
- The other three entries in `product/backlog/pull-request.md`.

## Verification

- Confirm the ranked order and the clamp against `contiguousMatch` and `rankedOverlayKeys`.
- Run `$janissary/scripts/run.mjs check-diff` before the commit.
- After the push, read the applied body and confirm only Step 3's `Do:` sentence changed.
