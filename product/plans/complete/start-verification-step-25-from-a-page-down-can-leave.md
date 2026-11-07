# Start verification Step 25 from a page Down can leave

**Complexity: 1/10** — a correction to one verification step in the pull request's own description, made after the push. No code, no tests, no spec, and no documentation. The care is in confirming the page the step starts from and the page `Down` reaches, and in preserving every other paragraph of the body.

## Goal

Step 25 checks that Escape closes the find overlay from outside its input without resetting zoom, and that the page keys work again once it has. It ends by pressing `Down` and expecting the page to change. But the run reaches Step 25 with `pdf-find-multi-page.pdf` on its last page, `3 / 3`, and `Down` can't leave the last page. So the readout stays put and a reviewer sees the page keys apparently fail, which is the exact behavior the step exists to confirm. The fix is to press `Return` after typing the query, which shows page 2, and to expect `Down` to reach page 3 with the readout reading `3 / 3`.

## Why the step starts on the last page today

- Step 12's third paragraph ends with the centre `pdf-find-multi-page.pdf` tab pressing `Escape`, `Down`, and `Page Down`, which leaves its readout at `3 / 3`. Step 10 left that tab in single page, and nothing later changes its layout.
- No step between 13 and 24 moves that tab's page. Steps 13 to 20 only type or replace queries. `setQuery` in `web/src/shared/line-find/useLineFind.ts` sets the query and resets the highlighted row to 0, and calls nothing on the tab. The page moves only through `usePdfFind.select` in `web/src/plugins/pdf/usePdfFind.ts`, which runs on a row click, Up, Down, or Return. Steps 21 to 24 work in other tabs.
- The tab stays mounted through all of this. A centre plugin tab is a `PluginTabLayer` body that is hidden rather than unmounted while another tab is current, so its page survives the trips to the other tabs. Only the docked `pdf-find-long.pdf` tab was mounted afresh in Step 12.
- In single page, `usePdfKeys` in `web/src/plugins/pdf/usePdfKeys.ts` sends `ArrowDown` to `pageBy(1)`. `pageBy` in `web/src/plugins/pdf/PdfTab.tsx` clamps with `Math.min(…, pageCount - 1)`, so from `3 / 3` it stays on `3 / 3`. Zoom doesn't matter here: in single page, Down pages at any zoom, and Step 10 left this tab at 200%.

## Why each expected result holds once Return is pressed

1. **Return shows page 2.** `contiguousMatch` in `web/src/shared/fuzzy-match.ts` finds `quick brown fox` on three lines, and every occurrence scores the same, since each starts after a space and runs uninterrupted. The tie goes to the shorter line. Page 2's `The quick brown fox appears again.` is 34 characters, page 3's `Another quick brown fox waits here.` is 35, and page 1's line is 50, so page 2's row ranks first. That agrees with the order the description's behavior example shows and the order Step 3 relies on. In `web/src/shared/line-find/LineFind.tsx`, Return calls `onChangeSelected(0)` only when there is at least one result. `PdfTab` passes `find.select` there, which calls `revealLine` and so `goToPage(1, …)`, and the readout shows `2 / 3`.
2. **Clicking the page keeps the keys on this tab.** The centre `PdfStage` is focusable only when docked, and the centre `tab-body` has no `tabIndex`, so the click moves focus off the input and onto the document body. With no enclosing `data-tab-label`, `usePdfKeyOwnership` in `web/src/plugins/pdf/usePdfKeyOwnership.ts` gives a current centre tab the keys.
3. **The first Escape closes only the overlay.** With the overlay open, `usePdfKeys` calls `closeOverlay` on Escape and returns before `resetZoom`. Zoom is unchanged.
4. **Down reaches page 3.** With the overlay closed, `Down` calls `pageBy(1)` from page index 1, which moves to index 2. The readout reads `3 / 3`.

## Departure from the backlog proposal

The proposal adds "press `Return` so page 2 is shown". This plan adds "press `Return` once the rows appear so page 2 is shown" instead. Return with no results does nothing, so pressing it before the rows exist would leave the page on `3 / 3` and the step would fail the same way. This tab read its text back in Step 1 and keeps it until it closes, so in practice the rows appear at once. The wording still makes the precondition explicit, matching Step 12's "press `Return` once the row labelled `5` appears". The proposal's `Expect:` change is used exactly as written.

## Implementation steps

1. After the push, read the current body with `gh pr view 1958 --json body` and write the revised body to `./temp/pr-body.md`.
2. In Step 25's `Do:` line, change "type `quick brown fox`, click the page so focus leaves the input" to "type `quick brown fox`, press `Return` once the rows appear so page 2 is shown, click the page so focus leaves the input". The full line then reads:

   ```
   Do: on `pdf-find-multi-page.pdf`, close any open overlay with `Escape`, press `Cmd+F`, type `quick brown fox`, press `Return` once the rows appear so page 2 is shown, click the page so focus leaves the input, and press `Escape`. Then press `Down`.
   ```

3. In Step 25's `Expect:` line, change "`Down` changes the page as usual." to "`Down` moves to page 3 as usual, and the readout reads `3 / 3`." The full line then reads:

   ```
   Expect: the first Escape closes only the overlay and leaves zoom unchanged. With the overlay closed, `Down` moves to page 3 as usual, and the readout reads `3 / 3`.
   ```

4. Leave Step 25's title line, every other step, every other paragraph, and the title byte-for-byte unchanged.
5. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md`, then read it back and confirm only Step 25 changed.

## Tests

None, and none possible: the artifact is prose in a pull request body. Return revealing the first ranked match, Escape closing the overlay from outside the input without resetting zoom, and the arrow keys paging a single-page tab are already covered by `web/src/plugins/pdf/PdfTab.test.tsx`. `$janissary/scripts/run.mjs check-diff` must stay clean so the push carries no unintended change.

## Specs and documentation

No spec change: `product/specs/pdf-tab.md` already says Return moves to the first ranked match and Escape closes the overlay without resetting zoom. No help or user-documentation change: neither describes this verification recipe.

## Out of scope

- Changing any code or test.
- Changing any verification step other than 25, including Step 12, whose final readouts this step now starts from without depending on them.
- Changing the summary, What section, behavior examples, screenshots note, or title.
- The other entry in `product/backlog/pull-request.md`, about PDF find marks repainting on every page read.

## Verification

- Confirm each expected result against `contiguousMatch`, `LineFind`, `rankedOverlayKeys`, `useLineFind`, `usePdfFind`, `PdfTab`, `PluginTabLayer`, `usePdfKeys`, `usePdfKeyOwnership`, and the fixture text.
- Run `$janissary/scripts/run.mjs check-diff` before the commit.
- After the push, read the applied body and confirm only Step 25 changed.
