# Press Return after each query in verification Step 12's two-tab key check

**Complexity: 1/10** — a correction to one paragraph of the pull request's own description, made after the push. No code, no tests, no spec, and no documentation. The care is in confirming every readout the paragraph states against the code, and in preserving every other paragraph of the body.

## Goal

Step 12's third paragraph checks that the PDF view's keys follow focus between a centre PDF tab and a docked one. It says typing `delta` in the centre makes the centre readout read `2 / 3`, and typing `page 5` in the docked tab makes the docked readout read `5 / 40`. Typing never moves the page, though. It only resets the highlighted row. So neither readout changes, the docked tab stays on `1 / 40`, and the later `7 / 40` expectation fails too. The fix is to press `Return` after each query, which reveals the first ranked row, and to say that the docked tab starts fresh in single page on page 1. With those two additions every readout the paragraph states is what the code produces.

## Why typing alone moves nothing

- `setQuery` in `web/src/shared/line-find/useLineFind.ts` sets the query and sets the highlighted row to 0. It calls nothing on the tab.
- `PdfTab` in `web/src/plugins/pdf/PdfTab.tsx` passes `find.setQuery` as `LineFind`'s `onChangeQuery`, so a keystroke in the input reaches only that state.
- The page moves only through `usePdfFind.select` in `web/src/plugins/pdf/usePdfFind.ts`, which calls `revealLine` and so `PdfTab`'s `goToPage`. `LineFind` calls it as `onChangeSelected` from a row click, from Up and Down, and from Return.
- `PdfTab.test.tsx`'s "shows the page of a highlighted match and updates the readout" clicks a row before asserting `2 / 3`, which agrees: the readout follows a selection, not a query.

## Why each readout holds once Return is pressed

1. **Centre `2 / 3`.** In `web/src/shared/line-find/LineFind.tsx`, Return calls `onChangeSelected(0)` when there is at least one result. `contiguousMatch` in `web/src/shared/fuzzy-match.ts` matches `delta` case-insensitively against one line of `pdf-find-multi-page.pdf`, page 2's `Delta epsilon.`. So row 0 is on page 2, `goToPage(1, …)` sets the page, and the readout shows `2 / 3`. That holds in either layout and at any zoom, because the readout is `page + 1` and `goToPage` sets `page` directly.
2. **Docked `5 / 40`.** `MountedViewLayers.tsx` filters docked plugin tabs out of `PluginTabLayer`, and `Sidebar.tsx` renders them through `DockedPluginBody`, which mounts its own `PluginBody`. Docking therefore mounts a fresh `PdfTab`: single page, page 1, zoom 100%, and no text read yet. Its read starts on its first `Cmd+F`. Only the line `Page 5` contains `page 5` in `pdf-find-long.pdf`. `Filler line 5.` doesn't, and there is no page 50. Return with no results does nothing, so the paragraph says to press it once the row labelled `5` appears. That is a refinement of the backlog proposal, which added only "and press `Return`": the forty-page read is visible long enough in Steps 16 and 32 that a quick Return can land before page 5 has been read. The three-page centre read has no such window worth naming.
3. **Docked `7 / 40`.** Clicking the docked page focuses its stage, which is focusable only when docked (`PdfStage`'s `focusable`). `usePdfKeyOwnership` gives a docked tab the keys only while focus is inside it, and gives the centre tab nothing while focus is in another tab's body. `usePdfKeys` closes the open overlay on Escape. In single page it sends `ArrowDown` and `PageDown` to `pageBy(1)` each, so the docked tab goes from `5 / 40` to `6 / 40` to `7 / 40`. The docked tab is in single page only because docking mounted it fresh. That is why the paragraph now says so.
4. **Centre `3 / 3`.** Clicking the centre page, which isn't focusable, leaves focus on the document body. With no enclosing tab label, the centre tab owns the keys and the docked tab doesn't. Escape closes the centre overlay. `Down` takes the centre from `2 / 3` to `3 / 3`, and `Page Down` clamps there through `pageBy`'s `Math.min`. The centre is in single page at this point in the run, since Step 10 left it there. The docked readout stays at `7 / 40`.

## Implementation steps

1. After the push, read the current body with `gh pr view 1958 --json body` and write the revised body to `./temp/pr-body.md`.
2. In Step 12's third paragraph, after the sentence naming `tab dock <label> right`, add "Docking opens that tab afresh, in single page on page 1, so its readout starts at `1 / 40`."
3. Change "type `delta`; the centre readout reads `2 / 3`" to "type `delta`, and press `Return`; the centre readout reads `2 / 3`".
4. Change "type `page 5`; the docked readout reads `5 / 40`" to "type `page 5`, and press `Return` once the row labelled `5` appears; the docked readout reads `5 / 40`".
5. Leave the rest of the paragraph, Step 12's first two paragraphs, the sentence naming the `a centre and a docked PdfTab` cases, every other paragraph, and the title byte-for-byte unchanged.
6. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md`, then read it back and confirm only that paragraph changed.

## Tests

None, and none possible: the artifact is prose in a pull request body. Return revealing the first ranked match, a row click updating the readout, and the centre and docked key routing are already covered by `web/src/plugins/pdf/PdfTab.test.tsx`. `$janissary/scripts/run.mjs check-diff` must stay clean so the push carries no unintended change.

## Specs and documentation

No spec change: `product/specs/pdf-tab.md` already says the arrows and a click move the view to a match, and Return moves to the first ranked match. No help or user-documentation change: neither describes this verification recipe.

## Out of scope

- Changing any code or test.
- Changing Step 12's first two paragraphs, or any other verification step, including Step 25, which another backlog entry covers.
- Changing the summary, What section, behavior examples, screenshots note, or title.
- The other two entries in `product/backlog/pull-request.md`.

## Verification

- Confirm each readout against `useLineFind`, `LineFind`, `usePdfFind`, `PdfTab`, `usePdfKeys`, `usePdfKeyOwnership`, `MountedViewLayers.tsx`, `Sidebar.tsx`, `DockedPluginBody`, and the fixture text.
- Run `$janissary/scripts/run.mjs check-diff` before the commit.
- After the push, read the applied body and confirm only Step 12's third paragraph changed.
