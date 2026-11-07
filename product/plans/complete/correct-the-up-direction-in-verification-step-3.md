# Correct the Up direction in verification Step 3

**Complexity: 4/10** — a one-word correction to the pull request's own description, made after the push. No code, no tests, no spec, and no documentation. The care is in confirming against the code which key actually moves the selection to the row that shows page 3, and in preserving every other paragraph of the body.

## Goal

Step 3 of the pull request's "How to verify" section tells the reviewer to press `Up` until the row labelled `3` is highlighted. The three rows for `quick brown fox` rank page 2, page 3, page 1, and the selection starts on the first row, so `Up` clamps on row 2 and never reaches page 3. Step 3 therefore cannot be performed as written. Step 9 already uses `Down` for the same third row. The fix is to tell the reviewer to press `Down`, leaving the expected page 3, the `3 / 3` readout, and the thumbnail wording unchanged.

## Why Down works

- `web/src/plugins/pdf/usePdfFind.ts` passes the document's line texts to `useLineFind`, which ranks them with `contiguousMatch`.
- `web/src/shared/fuzzy-match.ts`'s `contiguousMatch` sorts by score, then by shorter line, then by text, then by index. The three matching lines for `quick brown fox` are page 2's `The quick brown fox appears again.` (35 characters), page 3's `Another quick brown fox waits here.` (36 characters), and page 1's `The quick brown fox meets another quick brown fox.` (52 characters), so the rows rank page 2, page 3, page 1.
- `web/src/shared/line-find/useLineFind.ts` starts the selection at index 0 and resets it to 0 whenever the query changes, so the first row — page 2 — is selected when Step 3 begins.
- `web/src/shared/ranked-overlay-keys.ts` moves `ArrowUp` to `Math.max(0, selected - 1)` and `ArrowDown` to `Math.min(count - 1, selected + 1)`. From the first row, `Up` stays on page 2; one `Down` highlights page 3.
- `product/specs/pdf-tab.md` § Find already documents that the arrows highlight a row and reveal its match, so the spec needs no change.
- `web/src/plugins/pdf/PdfTab.test.tsx` already covers arrow movement and the reveal/readout.

## Implementation steps

1. After the push, read the current body with `gh pr view 1958 --json body` and write the revised body to `./temp/pr-body.md`.
2. In the "How to verify" happy-path Step 3, change "Do: press `Up` until the row labelled `3` is highlighted." to "Do: press `Down` until the row labelled `3` is highlighted."
3. Leave the rest of Step 3 — the expected page 3, the `3 / 3` readout, the page 3 thumbnail, the overlay staying open, and the input keeping focus — byte-for-byte unchanged. Leave every other paragraph, heading, and the title unchanged.
4. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md` and confirm the PR is still `OPEN` on `feature/pdf-tab-find`.

## Tests

None, and none possible: the artifact is prose in a pull request body, and the behavior the step exercises is already pinned by `web/src/plugins/pdf/PdfTab.test.tsx` and the ranking cases in `web/src/shared/fuzzy-match.ts`. `$janissary/scripts/run.mjs check-diff` must still pass so the push carries no unintended change.

## Specs and documentation

No spec change: `product/specs/pdf-tab.md` § Find already says the arrows highlight a row and move the view to that match. No help or user-documentation change: neither describes this verification recipe.

## Out of scope

- Changing any code or test.
- Changing any other verification step, including Steps 9, 16, and the What-section wording covered by the other backlog entries.
- Changing the behavior examples, screenshots note, summary, or title.
- The other three entries in `product/backlog/pull-request.md`.

## Verification

- Confirm the ranked order by reading `contiguousMatch` in `web/src/shared/fuzzy-match.ts` and the clamp in `web/src/shared/ranked-overlay-keys.ts`.
- Run `$janissary/scripts/run.mjs check-diff` before the commit.
- After the push, read the applied body and confirm Step 3 now says `Down`, its expectations are unchanged, and every other paragraph matches the author's text.
