# PDF find specs, help, user docs, and end-to-end verification

**Complexity: 2/10** — documentation only and no code, but it spans five files, the new PDF spec section has to carry every behavior decision from the landed code, and the manual pass is the feature's last gate.

## Goal

Replace the PDF spec's "no in-document search" sentence with a full Find section, update the keyboard, help, and user docs that name `Cmd+F`, and run the feature end to end. The four code subplans are already merged on `feature/pdf-tab-find`; this subplan changes documentation only.

## Design decisions and dependencies

This subplan depends on `pdf-find-01-shared-overlay`, `pdf-find-02-pdf-text-lines`, `pdf-find-03-find-hook-and-overlay`, and `pdf-find-04-match-marks`, all merged. It documents behavior that exists, not behavior that is planned.

- The landed code is the source of truth. Where the source feature plan (`product/plans/complete/pdf-tab-find.md`) and the code differ, the spec follows the code, and the difference is reported in the PR rather than fixed here.
- This subplan edits exactly five files: `product/specs/pdf-tab.md`, `product/specs/keyboard-navigation.md`, `help/keys.md`, `documentation/user-documentation/tab-types/pdf-viewer.md`, and `documentation/user-documentation/getting-started/keyboard.md`. It does not edit `product/specs/editor-tab.md`, `product/specs/shell-tab.md`, any source, test, or other documentation page. Those two specs are read-only cross-checks; a mismatch goes back to the subplan that owns them.
- No production code or test changes. If the spec work finds a behavior the code does not have, it goes back to the owning code subplan; do not write it into the spec as future behavior.
- The PDF spec is written in the surrounding spec's third-person present voice, with `### Find` as a third-level heading and `[[editor-tab]]` / `[[shell-tab]]` links for the shared overlay. The user docs are written for a reader who never sees the code: no module names, file paths, or internal class names, per `ai/guidelines/user-documentation.md`.
- The help row stays terse and follows the existing table's sentence case. No new PDF section is added to `help/keys.md`: this feature adds only `Cmd+F`, and the general row already carries it; the PDF tab's existing page and zoom keys are unchanged.
- Keep natural line breaks. Do not add em dashes to the new user-doc prose.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| PDF behavior spec | `product/specs/pdf-tab.md:156` — "There is no in-document search: no find field, no match navigation, and no match highlighting." | Edit: replace this sentence with the `### Find` section. Keep the rest of § Text selection. |
| Editor find spec | `product/specs/editor-tab.md:470` — "### Finding a line" | Read-only: confirm the shared overlay wording. Do not edit. |
| Shell find spec | `product/specs/shell-tab.md:233` — "### Transcript search" | Read-only: confirm the shared overlay wording. Do not edit. |
| Keyboard spec | `product/specs/keyboard-navigation.md:26` — the `Cmd+Shift+F` row's "Distinct from Cmd+F, which searches an editor buffer or a shell tab's transcript" | Edit: add the PDF tab's document to that contrast clause. |
| Help key table | `help/keys.md:28` — the general `Cmd+F` row, "Search for a line in an editor buffer or a shell tab's transcript" | Edit that row only. Leave the shell row at `:55` and the editor row at `:104` unchanged. |
| PDF user page | `documentation/user-documentation/tab-types/pdf-viewer.md:55` — "There is no in-app copy button, and no find field — searching inside a document isn't supported yet." | Edit: keep the copy-button sentence, replace the find clause, and add `## Finding text` after `## Selecting text`. |
| Keyboard user page | `documentation/user-documentation/getting-started/keyboard.md:36` — the `Cmd+F` row's "does nothing in other tabs" | Edit: name the PDF tab and link it to `#finding-text`. |
| Manifest chord | `src/plugins/pdf/manifest.ts:25` — `chords: ['meta+f']` | The behavior the spec documents. Already pinned by `src/plugins/declaration-validation.test.ts:165-167`; do not change. |
| Rendered strings | `web/src/shared/line-find/LineFind.tsx:61` (`type to search`), `:63` (`No matching lines`), `:82-88` (Cmd+F selects the query); `web/src/plugins/pdf/PdfTab.tsx:184` (`Search document`), `:191-194` (page label), `:195` (`Reading pages…`) | Quote these exactly in the spec and user docs. |
| Reveal and Escape | `web/src/plugins/pdf/usePdfStageViewport.ts:70-77` (offset scroll by a quarter of `stage.clientHeight`); `web/src/plugins/pdf/usePdfKeys.ts:35-39` (overlay closes before `resetZoom()`) | The spec's movement and Escape ordering must match these. |
| Marks | `web/src/plugins/pdf/pdf-find-marks.ts`, `web/src/plugins/pdf/usePdfFindMarks.ts`, `web/src/plugins/pdf/pdf.css:37-38` (theme accent at 20% and 45%) | The spec's mark behavior and the user doc's description must match these. |

## Proposed changes

### 1. `product/specs/pdf-tab.md`: replace the no-search sentence with `### Find`

Replace the sentence at `product/specs/pdf-tab.md:156` with a new `### Find` section placed between `### Text selection` and `### Confined to its own tab`. Keep the rest of § Text selection, including "There is no in-app copy button and no 'copy all text' action." Do not change the intro, § Layout, § Zoom and keys, § Confined to its own tab, or § When a document cannot be rendered. The Find section may reference § When a document cannot be rendered for the distinction between a failed Find read and a failed text-layer render.

The section must cover the following, in this order. Use prose, not bullets, in the spec itself.

**Opening and availability.**
- `Cmd+F` opens the editor tab's find overlay over the PDF tab while the PDF tab is the visible one. It is the same overlay the editor and shell tabs use: same input, same ranked rows, same appearance, same keys, same `type to search` and `No matching lines` states. When another tab is focused, the chord means what it means there: the editor's find, the shell's transcript find, or the application's own binding. Find changes only what is in view and never writes to the document.
- `Ctrl+F` does not open the overlay; the PDF tab adds no `Ctrl+F` binding.
- While the PDF tab is visible, `Cmd+F` is answered even before the document has loaded and after a load failure. In those states it does nothing visible, and the browser's own find bar does not open.
- The overlay sits against the bottom edge of the tab, spans the tab's full width, covers the page strip when it is showing, takes at most 70% of the tab's height, and scrolls its rows when they overflow. It is available in both page layouts. The input opens focused, and its placeholder and accessible name are `Search document`.
- While focus is in the overlay's input, it takes the keyboard, so the PDF view's arrows, page keys, and Escape do not also act on the document behind it. The arrow and page keys work on the document as usual while focus is outside the overlay.

**What is searched.**
- Matching is the editor's: one uninterrupted, case-insensitive occurrence of the typed text, with no regex, case, or whole-word options. Up to ten rows are listed.
- The whole document is searched, every page, not only the pages that have been drawn.
- Each searchable line is one visual line of text on a page. Two lines with the same text are two rows.
- A match must sit within one line. A phrase that wraps onto the next line, or a word hyphenated across a line break, is not found. This is a documented limitation, not a bug.
- The text is read once per tab, the first time the overlay opens, and kept until the tab closes. The document shown never changes after it is opened.
- Results fill in page by page while the read is in progress and re-rank as each page arrives.
- A page whose text cannot be read contributes no lines and sends no notification. Reading for Find is best-effort; this is separate from a page whose drawn text layer fails to render, which still follows § When a document cannot be rendered.
- A document with no text, such as a scanned PDF of page images, is searched like any other. Once reading finishes, every query with non-whitespace text answers `No matching lines`, with no separate no-text message.

**Results.**
- An empty or whitespace-only query shows `type to search` with no rows and no marks.
- Each row is one matching line: the line's 1-based page number, dimmed, where the editor shows a line number, then the line's text with the matched characters emphasized. A line too long for the overlay is clipped with an ellipsis rather than wrapped.
- Rows are ranked as the editor ranks them, best-scoring first, and capped at ten. An occurrence outside the ten is reached by refining the query.
- While the document's text is still being read and the query has non-whitespace text, a muted `Reading pages…` row shows below the results, or in place of `No matching lines` when there are none. It disappears when reading finishes.

**Moving to a match.**
- `↑` / `↓` and a click highlight a row and move the view to that match immediately. A click keeps focus in the overlay's input.
- In single page, the match's page becomes the shown page. In continuous scroll, the stage scrolls so the matched line sits about a quarter of the stage's height below the stage's top edge, clamped by the stage's scroll limits; that places the line above the overlay. Past 100% in single page, the stage also scrolls to that quarter position.
- The header's position readout and the page strip's highlighted thumbnail follow, as for any other page change. No text selection is made.
- Return moves to the first ranked match even when another row is highlighted, and the overlay stays open.
- Escape closes the overlay and leaves the view at the last previewed match. It does not reset zoom. With the overlay closed, Escape resets zoom to 100% as today. Escape closes the overlay the same way when focus has left its input and is on the page.
- Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document. Closing because the tab stopped being visible restores nothing, since focus has already moved. Switching away from the PDF tab closes the overlay; returning and pressing `Cmd+F` opens a fresh, empty one. Closing by any route discards the query and the highlighted row, so reopening starts empty.
- While the overlay is open, `Cmd+F` keeps it open. With focus in the input, it selects the whole query so typing replaces it. With focus outside the input, it focuses the input and selects the query. The browser's find bar never appears.

**Marks and accessibility.**
- While the overlay is open with a query that has non-whitespace text, every occurrence on the drawn pages is marked, not only the ten listed. The occurrence behind the highlighted row is marked more strongly than the rest.
- Pages drawn later while the overlay is open get their marks too. Closing the overlay clears every mark.
- The marks use the theme accent at a low and a higher translucency, both translucent enough for the page's own text to show through. They stay distinct from the text layer's blue selection and stay inside the PDF tab.

Check every sentence against the landed code before finishing. In particular, confirm `Search document`, `type to search`, `No matching lines`, and `Reading pages…` by searching `web/src/shared/line-find/` and `web/src/plugins/pdf/`; confirm the reveal uses a quarter of the stage's client height in `usePdfStageViewport.ts`; confirm the Escape ordering in `usePdfKeys.ts`; confirm the two accent strengths in `pdf.css`.

### 2. `product/specs/keyboard-navigation.md`

Change only the `Cmd+Shift+F` row at `product/specs/keyboard-navigation.md:26`. Replace "Distinct from Cmd+F, which searches an editor buffer or a shell tab's transcript" with "Distinct from Cmd+F, which searches an editor buffer, a shell tab's transcript, or a PDF tab's document". Do not add a new `Cmd+F` row; the editor, shell, and PDF specs own their own find sections.

### 3. `help/keys.md`

Change only the general `Cmd+F` row at `help/keys.md:28` from "Search for a line in an editor buffer or a shell tab's transcript" to "Search for a line in an editor buffer, a shell tab's transcript, or a PDF tab's document". Leave the shell tab's own `Cmd+F` row at `:55` and the editor tab's `Cmd+F` mention at `:104` unchanged. Do not add a PDF tab controls table: this feature adds only `Cmd+F`, and the general row carries it; the tab's existing page and zoom keys are unchanged.

### 4. `documentation/user-documentation/tab-types/pdf-viewer.md`

In § Selecting text, keep "There is no in-app copy button." and remove only the stale find clause from the sentence at `:55`. Then add a `## Finding text` section after `## Selecting text` and before `## When a PDF won't open`. Do not add a fourth character sprite; the page already has three.

Write the section for a reader, not a contributor. It must cover:
- Press `Cmd+F` while a PDF tab is open and its document has loaded. A search field labeled `Search document` opens over the bottom of the tab. Use `Cmd+F`, not `Ctrl+F`.
- Type a word or phrase. Search ignores case. The list shows the matching lines with their page numbers, and every match on the pages in view is marked, with the highlighted row's match marked more strongly.
- The whole document is searched, not only the pages you have looked at. The first search reads the document's text. Once you type, a long document shows `Reading pages…` and fills in as it reads.
- Use `↑` / `↓` or click a row to jump to a match. When you are showing one page at a time, the match's page comes into view; in continuous scroll the page scrolls so the match sits about a quarter of the way down. If you are zoomed in, the page also scrolls to bring the match into view. `Return` jumps to the best match.
- Matches stay within one line. A phrase that wraps to the next line, or a word hyphenated across a line break, is not found.
- An empty field shows `type to search`; a query with no matches shows `No matching lines`. Closing the search clears the marks and leaves you on the match you were looking at. `Escape` closes it without changing the zoom; with the search closed, `Escape` still returns the zoom to 100%.
- Closing the search returns the keyboard to where it was, usually the page, so the page and zoom keys work again. Switching to another tab closes the search, and opening it again starts with an empty field.
- Search works only once the document has loaded. While it is loading or after it fails to open, `Cmd+F` does nothing, and the browser's own find bar does not open.

Use the page's existing tone. Do not name files, functions, modules, or internal classes. Do not add em dashes to the new prose.

### 5. `documentation/user-documentation/getting-started/keyboard.md`

Change the `Cmd+F` row at `documentation/user-documentation/getting-started/keyboard.md:36` so it reads: "Open the find bar in an editor tab, over a shell tab's terminal [transcript](/user-documentation/command-bar/transcript-search), or in a [PDF tab](/user-documentation/tab-types/pdf-viewer#finding-text); does nothing in other tabs." Keep the existing link and table layout; only the PDF clause and its link are new.

### 6. Read-only cross-check of the editor and shell specs

Read `product/specs/editor-tab.md:470` ("### Finding a line") and `product/specs/shell-tab.md:233` ("### Transcript search"). Confirm they already say the shared overlay's input selects the whole query on a second `Cmd+F` and that the input's accessible name equals its placeholder. Do not edit either file. If either contradicts the landed code, report it against the subplan that owns it in the PR rather than changing it here.

## Tests

No new test files and no test edits. This subplan changes no code, so no test can regress. Confirm the existing pins stay untouched:

- `src/plugins/declaration-validation.test.ts:165-167` pins `pdfManifest.chords` to `['meta+f']`.
- `src/plugins/documentation.test.ts` pins the developer-doc capability names and the v3 changelog count; neither changes here.

The spec and docs have no automated prose test. Correctness comes from the exact-string cross-check in § 1 and the manual pass below.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Because this subplan changes no source, it should pass with no code findings; a reported source file means something outside this subplan changed.

Run `npm run docs:build`. It must pass. `documentation/.vitepress/config.mts` sets no `ignoreDeadLinks`, so a dead link in the new user-doc section fails the build.

Manual end-to-end check in the running app:

1. `open` a multi-page PDF with selectable text, press `Cmd+F`, and confirm the overlay opens against the bottom of the tab, the field reads `Search document` and is focused, the empty state is `type to search`, and no browser find bar appears.
2. Type a word that appears on several pages. Confirm the rows show 1-based page numbers, the matched characters are emphasized, a long line is clipped with an ellipsis, and every occurrence on the shown page is marked with the current row's occurrence stronger.
3. Type a query whose matches include a later page, press `Down` until the highlighted row is on that page, and confirm the shown page changes, the position readout follows, the page strip's thumbnail follows when the strip is open, and no text is selected. Click another row and confirm the view moves there and focus stays in the field.
4. Press `Return` with another row highlighted and confirm the first ranked match is shown and the overlay stays open.
5. Switch to continuous scroll, highlight another match, and confirm its line sits about a quarter of the way down the stage. Scroll to a page that was not drawn yet and confirm its matches are marked.
6. Zoom past 100%, highlight a match in single page, and confirm the stage scrolls to the same quarter position.
7. Press `Cmd+F` again with focus in the input and confirm the query is selected, the overlay stays open, and no browser find bar appears. Click the page so focus leaves the overlay, press `Cmd+F`, and confirm the input is focused with the query selected.
8. While zoomed past 100%, press `Escape` and confirm the overlay closes, the marks clear, the view stays on the last previewed match, focus returns to where it was, and zoom is unchanged. Press `Escape` again and confirm zoom returns to 100%.
9. Click the page so focus leaves the overlay while it is open, press `Escape`, and confirm only the overlay closes and zoom is unchanged. Then confirm the arrow and page keys move the document.
10. Switch to another tab and back, press `Cmd+F`, and confirm the overlay opens empty and no marks remain.
11. Open a long document, press `Cmd+F`, and type a query. Confirm `Reading pages…` shows below the results (or in place of `No matching lines`) while pages are read, results fill in, and the status disappears when reading finishes.
12. Open a scanned PDF with no text, press `Cmd+F`, and type a query. Confirm `Reading pages…` shows while it reads, then every query answers `No matching lines`, with no separate message.
13. Try a document while it is still loading and after a failed load. Confirm `Cmd+F` does nothing there and the browser find bar does not appear.
14. If two PDF tabs can be placed in a split, confirm each keeps its own marks and closing one leaves the other's marks in place.

## Out of scope

- Writing to the document in any way: annotation, form filling, or signing.
- Regex, case-sensitive, or whole-word matching. The editor's matcher is used unchanged.
- Matches that span a line break, including hyphenated words.
- A match counter such as `3 of 17`, or next and previous match buttons in the PDF header.
- A typed command that opens the overlay pre-filled. A PDF tab has no command bar.
- Marking pages that contain matches in the page strip.
- A separate message for a document with no searchable text.
- Screenshots, a new documentation page, or a help table section for the PDF tab.
- A plugin API changelog entry. The manifest chord claim is not an API change.
- Editing `product/specs/editor-tab.md` or `product/specs/shell-tab.md`; both are read-only cross-checks here.
- Editing the other user-documentation pages that mention `Cmd+F` (`tab-types/editor.md`, `command-bar/transcript-search.md`, `command-bar/shell.md`); each already describes its own surface.
- Any behavior not already implemented by `pdf-find-01` through `pdf-find-04`. If the spec finds a gap, it goes back to the subplan that owns it rather than being written as future behavior.
