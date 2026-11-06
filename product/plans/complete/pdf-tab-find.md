# Find text in a PDF tab

**Complexity: 5/10** — client-only and modeled on the shell's reuse of the find overlay, but it adds progressive text reading, line-aligned match marks over PDF.js's text layer, an offset reveal in both layouts, and small changes to the overlay the editor and shell share.

Feature: The PDF tab (`product/specs/pdf-tab.md`) is a clean, read-only viewer, but it can't find text. add the search functionality from the editor tab to the pdf viewer. bind to cmd+f.

A PDF tab draws the document's pages and makes their text selectable, but there's no way to find a word in it. The spec says so outright: "There is no in-document search: no find field, no match navigation, and no match highlighting." This feature gives the PDF tab the same `Cmd+F` find overlay the editor tab and the shell tab already share, pointed at the document's text, so a reader can jump to where a phrase appears instead of paging through by eye.

## Design decisions

- `Cmd+F` opens the find overlay while a PDF tab is the visible one. It is the editor tab's overlay (`product/specs/editor-tab.md` § Finding a line), the same one the shell tab reuses (`product/specs/shell-tab.md` § Transcript search).
- `Cmd+F` reaches the PDF tab the way it reaches the shell tab: the PDF plugin's declaration claims the `meta+f` chord, so it belongs to the PDF tab only while that tab is the visible one and returns to the application the moment another tab is focused.
- The overlay's matching is the editor's: one uninterrupted, case-insensitive occurrence of the typed text, with no regex, case, or whole-word options, and at most ten ranked results.
- The overlay owns its keys while it is open. Every keystroke in its input is swallowed (`rankedOverlayKeys`), so `↑` / `↓`, Page Up / Page Down, and Escape do not also page, scroll, or reset zoom in the PDF view behind it.
- The PDF view's text is read in the browser from the document already loaded, never on the server, exactly as the pages are drawn in the browser today.
- The document is still never written to. Find changes only what is in view.

### What is searched

- The whole document is searched, every page, not only the pages that have been drawn.
- Each searchable line is one visual line of text on a page: PDF.js's text for that page, grouped into the lines a reader sees. Two lines with the same text are two rows.
- A match must sit within one line, as in the editor and the shell tab. A phrase that wraps onto the next line, or a word hyphenated across a line break, is not found. This is a documented limitation, not a bug.
- A document with no text (a scanned PDF of page images, for example) is searched like any other and answers every query with `No matching lines`. There is no separate no-text message.
- A page whose text cannot be read contributes no lines and sends no notification. Find is best-effort over what can be read, the same way a thumbnail that fails to draw does not fail the document (`product/specs/pdf-tab.md` § When a document cannot be rendered).
- `Cmd+F` does nothing while the document is still loading or after it failed to load, the same as the zoom and page keys today. It is still swallowed there, so the browser's own find bar does not open either.
- The text is read once per tab, the first time the overlay opens, and kept until the tab closes. The document shown never changes after it is opened (`pdf-tab.md`: "later edits to the file on disk are not reflected until it is opened again"), so there is nothing to re-read.

### Results

- The overlay's input placeholder reads `Search document`. The empty state is the editor's `type to search` hint and a query with no match shows `No matching lines`.
- Each row is one matching line, labelled with its 1-based page number where the editor shows a line number, beside the line's text with the matched characters emphasized.
- Rows are ranked exactly as the editor ranks them: best-scoring first, ties broken the way the editor breaks them. Only the top ten are listed, so an occurrence outside the ten can only be reached by refining the query.

### Moving to a match

- Highlighting a row with `↑` / `↓` or a click moves the view to that match at once. In single page, the match's page becomes the shown page; in continuous scroll, the stage scrolls so the matched line sits about a quarter of the way down the stage. When the page is zoomed past 100% in single page, the stage also scrolls so the line sits a quarter of the way down. The position readout and the page strip's highlighted thumbnail follow, as for any other page change. No text selection is made.
- Return moves to the first ranked match, even when another row is highlighted, and the overlay stays open.
- Escape closes the overlay and leaves the view at the last previewed match. It does not reset zoom. With the overlay closed, Escape resets zoom to 100% as today.
- While the overlay is open but focus has left its input (after a click on the page, say), Escape still only closes the overlay, the same as the editor's Escape from the buffer (`editor-tab.md`: "that Escape only closes the overlay and does not also collapse a selection"). The arrow and page keys work on the document as usual while focus is outside the overlay.
- Switching away from the PDF tab closes the overlay, and `Cmd+F` on return opens a fresh, empty one. Nothing about the overlay survives a close (`useLineFind`'s existing behavior).

### Match highlighting on the pages

- While the overlay is open with a non-empty query, every occurrence of it on the drawn pages is marked, not only the ten listed. The occurrence behind the highlighted row is marked in a stronger color than the rest.
- Pages drawn later while the overlay is open (scrolled into view, or after a zoom or layout change) get their marks too.
- Closing the overlay clears every mark.

## What already exists (reuse, don't rebuild)

| What | Where | Reuse |
| --- | --- | --- |
| Find overlay component | `web/src/shared/line-find/LineFind.tsx`, published as `LineFind` from `web/src/plugins/api.ts` | The overlay itself: input, ranked rows, empty and no-match states, key handling |
| Find state hook | `web/src/shared/line-find/useLineFind.ts`, published as `useLineFind` | Open flag, query, capped contiguous-match results, highlighted row, close on tab switch |
| Substring matcher | `contiguousMatch` in `web/src/shared/fuzzy-match.ts` | Already what `useLineFind` runs |
| Overlay keys | `rankedOverlayKeys` in `web/src/shared/ranked-overlay-keys.ts` | Swallows every key so nothing reaches the PDF view's window listener |
| Plugin chord claims | `chords` in a `TabPluginDeclaration` (`src/plugins/api.ts:113`), delivered as `capabilities.claimedChords` (`web/src/plugins/PluginBody.tsx:156`), registered with `usePluginChordClaims` (`web/src/plugins/PluginChords.tsx`, published from `web/src/plugins/api.ts`) | `meta+f` claim, exactly as `src/plugins/shell/manifest.ts` (`chords: ['ctrl+r', 'meta+t', 'meta+f']`) and `ShellTab.tsx` (`if (chordId === FIND_CHORD)`) do |
| Chord routing with focus on the page | `chordTabLabel` in `web/src/useWindowKeys.ts` (`if (focusOnPage) return snap.currentPluginTab;`) and `handleChordKeys` (`if (chords.run(…)) { e.preventDefault(); …`) | A claimed chord fires for the visible PDF tab even when focus rests on the document body, and the window handler prevents the browser's default |
| Shell transcript find | `web/src/plugins/shell/useShellTranscriptFind.ts`, `ShellTab.tsx` | The model for a plugin wrapping `useLineFind` over its own lines, a `select(index)` that sets the highlighted row and reveals it, and rendering `LineFind` with a placeholder |
| PDF.js access | `web/src/plugins/pdf/pdf-document.ts` (`loadPdf`, `LoadedPdf`, `drawPage`) | The only module that touches PDF.js; reading a page's text is added to `LoadedPdf` here |
| PDF.js line ends | `hasEOL` on each text item of `getTextContent()` (`pdfjs-dist` 6.3.289, `types/src/display/api.d.ts`), the same flag `TextLayer` turns into a `<br>` in the drawn layer | Grouping a page's text into lines without any geometry of our own |
| PDF.js coordinates | `PDFPageProxy.getViewport({ scale: 1 })` and its `convertToViewportPoint`, already used for page sizes in `loadPdf` | Turning a line's position into a fraction of the page's height, rotation included |
| Painting ranges without touching the DOM | `paint` in `web/src/plugins/shell/reply-selection.ts` (`CSS.highlights.get(REPLY_HIGHLIGHT) ?? new Highlight()`) and its `::highlight(shell-reply-selection)` rule in `shell.css` | Marking matches as CSS Custom Highlight ranges over the text layer, so the layer PDF.js draws is never rewritten and text selection keeps working; skipped where the API is missing, as in jsdom |
| Page jumps | `goToPage` and `PdfJump` (`{ page, token }`) in `web/src/plugins/pdf/PdfTab.tsx`, consumed by the token-driven scroll in `usePdfStageViewport.ts` (`?.scrollIntoView({ block: 'start' })`) | Moving to a match's page in either layout; extended with a position on the page |
| PDF keys | `web/src/plugins/pdf/usePdfKeys.ts` | Bindings behind the overlay; its Escape learns to close an open overlay first |
| Chord provider in tests | `PluginChordProvider` and `createPluginChordRegistry` wrapping the body in `web/src/plugins/shell/ShellTab.test.tsx` | `PdfTab.test.tsx` needs the same wrapper once `PdfTab` calls `usePluginChordClaims`, which throws without a provider |

## Proposed changes

No server code changes beyond the one-line manifest claim, and no wire changes: the claim already travels to the client as `claimedChords`, and everything else is view-local.

### Shared overlay (`web/src/shared/line-find/`)

- `LineFind.tsx`: the input's `aria-label` is its `placeholder`, so every caller gets an accessible name with no new prop (`Search buffer`, `Search transcript`, `Search document`).
- `LineFind.tsx`: its key handler checks for `Cmd+F` (meta and `f`, no other modifier) before handing the key to `rankedOverlayKeys`; it prevents the default and selects the whole input value. `rankedOverlayKeys` itself is unchanged, since quick-open shares it and has no find chord.
- `LineFind.tsx`: three optional props. `inputRef` is attached to the input, so a caller can focus it and select its query. `rowLabel(result)` returns the dimmed label for a row; when absent the row shows `result.index + 1` as today. `status` is a muted line shown when the query is not empty: below the rows when there are results, and in place of `No matching lines` when there are none. The editor and shell pass none of the three, so they render exactly as today.
- `useLineFind.ts`: unchanged. Its `useMemo` over `lines` already re-ranks when a new lines array arrives, and its clamp effect keeps the highlighted row in range as results change.

### PDF plugin

- `src/plugins/pdf/manifest.ts`: add `chords: ['meta+f']`, with a comment in the style of the shell manifest's: claimed only while a PDF tab is the visible one, and the application leaves `Cmd+F` to the editor everywhere else.
- `web/src/plugins/pdf/pdf-document.ts`: `LoadedPdf` gains `readPageText(index)`, resolving to that page's text items as plain data: each item's string, its `hasEOL` flag, and its top as a fraction of the page's height (from the item's transform through the page's scale-1 viewport, so a rotated page is handled by PDF.js). It reads through `getTextContent()` on the already-fetched page proxy. Nothing outside this module sees a PDF.js type.
- `readPageText` skips marked-content entries (those with no `str`), exactly as `TextLayer` does before it draws a span.
- `web/src/plugins/pdf/pdf-find-lines.ts` (new, pure): `pageLines(pageIndex, items)` joins items into lines, ending a line after every item with `hasEOL` and at the end of the page. It keeps every line, empty ones included, because `TextLayer` appends one `<br>` for every `hasEOL` item even when the item's string is empty (`pdfjs-dist/build/pdf.mjs`, `#appendText`: "`if (textDivProperties.hasEOL) { … br …`"), so a line's index on its page is the same number in both models. An empty line never matches, since `contiguousMatch` returns nothing for a blank query and an empty line cannot contain a non-blank one. Each line keeps its text, its page index, its index on the page, and its top fraction (the first item's). The hook concatenates pages' lines in page order into one array, so `useLineFind`'s `index` maps straight back to a line.
- `web/src/plugins/pdf/pdf-find-marks.ts` (new, DOM but React-free): `occurrencesInLayer(layer, query)` walks a drawn `.pdf-text-layer`'s text nodes in document order, splitting lines at each `<br>`, and returns a `Range` for every case-insensitive occurrence that sits within one line (a range may cross the spans PDF.js splits a line into), each tagged with its line index on the page. `paintMarks(…)` adds ranges to two shared highlights, `pdf-find-match` and `pdf-find-current`, the way `paint` in `reply-selection.ts` does, and returns a function that deletes exactly those ranges. Each tab adds and removes only its own ranges, so two PDF tabs in a split each keep their own marks. Where `CSS.highlights` or `Highlight` is missing, it does nothing.
- `web/src/plugins/pdf/usePdfFind.ts` (new hook, modeled on `useShellTranscriptFind`): owns the read lines, a `reading` flag, and the element focused before opening. `open()` records `document.activeElement`, starts reading on the first open only, and calls `useLineFind`'s `open`. Reading walks pages in order, awaiting `readPageText` one page at a time, appending each page's lines as a new array, and stops when the hook unmounts or the document's `destroy` has run; a page whose read rejects contributes nothing. `select(index)` sets the highlighted row and asks the tab to reveal that line's page and top fraction. `close()` closes the overlay and refocuses the remembered element if it is still in the document. A second `Cmd+F` with focus in the overlay's input never reaches this hook (the input handles it). With focus outside the open overlay, the chord does arrive here, and the hook focuses the input and selects its query instead of reopening, through an optional `inputRef` that `LineFind` attaches to its input.
- Reading publishes a new lines array after every page, so a very long document re-ranks once per page while it is read. That is cheap at document scale; if it ever shows, publish at most once per animation frame instead.
- Reveal: `PdfJump` gains an optional `offset`, a fraction of the page's height. `usePdfStageViewport`'s token-driven scroll keeps today's `scrollIntoView({ block: 'start' })` when no offset is given. With one, in either layout it scrolls the stage so the point `offset` of the way down that page's `.pdf-page` element sits a quarter of the stage's client height from its top, clamped by the browser's own scroll limits. The target comes from bounding rectangles rather than `offsetTop`, since the stage is not the page's offset parent: the stage's current `scrollTop`, plus the page rectangle's top minus the stage rectangle's top, plus `offset` times the page rectangle's height, minus a quarter of the stage's `clientHeight`. Single page applies it after the page is listed, so a match on another page shows that page first. The visible-page observer then updates the position readout and the thumbnail as for any scroll.
- `usePdfPageRender.ts`, `PdfPage.tsx`, `PdfStage.tsx`: an optional `onTextLayer(index)` callback, called after `renderPage` resolves for a page that has a text layer. `PdfTab` bumps a counter on each call so the marks re-apply to a freshly drawn or redrawn layer (a zoom or resize redraw replaces the layer's children and with them every old range).
- `web/src/plugins/pdf/usePdfFindMarks.ts` (new hook): while the overlay is open with a non-empty query, for each `.pdf-text-layer` in the stage it paints every occurrence into `pdf-find-match`, and paints the occurrence whose page, line index, and start match the highlighted result into `pdf-find-current` instead. It repaints when the query, the highlighted row, or the text-layer counter changes, and clears everything when the overlay closes or the tab unmounts. Each repaint walks every drawn layer. A page keeps its drawn layer once drawn (`PdfPage.tsx`: "A page keeps its canvas once it has been drawn"), so after reading a long document end to end that is every page; repainting only the layer that changed is the upgrade if typing ever lags.
- `web/src/plugins/pdf/usePdfKeys.ts`: takes the overlay's open state and a close callback; while the overlay is open, Escape closes it and does not reset zoom. Every other key is unchanged.
- `web/src/plugins/pdf/PdfTab.tsx`: calls `usePluginChordClaims('pdf', capabilities.label ?? 'pdf', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, handler)` with the same arguments shape as `ShellTab.tsx`. The claim is registered whenever the tab is active, so `Cmd+F` is always swallowed there; the handler does nothing unless the document is loaded. It renders `LineFind` with placeholder `Search document`, `rowLabel` returning the line's page number, and `status` `Reading pages…` while reading is unfinished. It counts 137 lines under the `max-lines` rule today (blank lines and comments skipped), and these additions come to roughly 30, so no extraction is planned; if the lint run says otherwise, move the metadata header and its controls into a `PdfHeader.tsx` beside it.
- `web/src/plugins/pdf/pdf.css`: `.pdf-tab` gets `position: relative`, making it the overlay's containing block as `.editor-tab` is for the editor (`theme.css`: "`position: relative` makes it the positioning context for the find overlay"). The two highlight rules are written as `.pdf-text-layer ::highlight(pdf-find-match)` and `.pdf-text-layer ::highlight(pdf-find-current)`, using the theme accent mixed toward transparent at a low and a higher strength, so every selector stays rooted in a `pdf-` class.

### Implementation order

Each step keeps typecheck and tests green:

1. The shared overlay changes (accessible name, `Cmd+F` select, `rowLabel`, `status`) with their tests and the editor and shell spec lines.
2. `readPageText`, `pdf-find-lines.ts`, and `usePdfFind`, then the manifest claim and the overlay in `PdfTab` with reveal and the Escape change.
3. The text-layer callback, `pdf-find-marks.ts`, `usePdfFindMarks`, and the highlight rules.
4. Specs, help, and user docs.

### Specs and docs

- `product/specs/pdf-tab.md`: replace "There is no in-document search: no find field, no match navigation, and no match highlighting." with a Find section covering every decision above.
- `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search: `Cmd+F` inside the open overlay selects the query; the input's accessible name.
- `product/specs/keyboard-navigation.md`: the Cmd+Shift+F row's "Distinct from Cmd+F, which searches an editor buffer or a shell tab's transcript" names a PDF tab's document too.
- `help/keys.md`: the general `Cmd+F` row ("Search for a line in an editor buffer or a shell tab's transcript") names a PDF tab's document. The file has no PDF section today, so no new table is added.
- `documentation/user-documentation/tab-types/pdf-viewer.md`: replace "There is no in-app copy button, and no find field — searching inside a document isn't supported yet." with a short find section.
- `documentation/user-documentation/getting-started/keyboard.md`: the `Cmd+F` row's "does nothing in other tabs" names the PDF tab as a tab where it works.

## UI design

The feature adds the existing find overlay (`LineFind`, styled by the `.picker` and `.editor-find` rules in `web/src/theme.css`) to the PDF tab body (`web/src/plugins/pdf/PdfTab.tsx`). Today the editor and shell tabs render it at the bottom of their bodies.

### Placement and layout

- The overlay sits where the editor's and shell's do: anchored to the bottom edge of the PDF tab, spanning its full width (over the page strip too), at most 70% of the tab's height, with the `.picker` shadow and background. The PDF tab body becomes the overlay's positioning context, as `.editor-tab` is for the editor's.
- Its input sits at the top of the overlay, followed by the result rows. Each row is a dimmed, right-aligned bare page number in the column the editor uses for line numbers, then the line's text with the matched characters in the existing `mark` style. A line too long for the overlay is clipped with an ellipsis.
- Because the overlay covers the bottom of the tab, revealing a match places its line a quarter of the way down the stage, above the overlay.

### Interaction

- `Cmd+F` opens the overlay with an empty, focused input. The element that had focus before is remembered.
- `↑` / `↓`, a click, Return, and Escape behave as set out under Moving to a match. A click keeps focus in the input.
- `Cmd+F` while the overlay is already open keeps it open and selects the whole query, so typing replaces it. The browser's own find bar never appears. This change is made in the shared overlay, so the editor's and shell's overlays behave the same way.
- Escape closes the overlay and returns focus to the element that had it before `Cmd+F` was pressed, usually the document body, so the page and zoom keys keep working. Closing because the tab stopped being visible restores nothing, since focus has already moved elsewhere.

### States

- Empty query: the `type to search` hint, no rows, no marks.
- Reading text: the document's text is read when the overlay first opens, and results fill in and re-rank as pages are read. While reading is unfinished and the query is not empty, a muted `Reading pages…` row sits below the results, and takes the place of `No matching lines` until reading finishes.
- No match once every page is read: `No matching lines`.
- Loading or failed document: `Cmd+F` does nothing and the overlay never opens.
- Overflow: at most ten rows; long lines are clipped; a narrow pane or a sidebar dock narrows the overlay with the tab.

### Keyboard and accessibility

- One new binding, `Cmd+F`, active only while a PDF tab is the visible one. It does not collide with the PDF tab's own keys (`↑` / `↓`, Page Up / Page Down, Escape, Ctrl / Cmd + wheel), and it extends the existing `Cmd+F` row in `help/keys.md` rather than taking a chord from anything else. Ctrl+F is unaffected.
- While the overlay is open its input holds the keyboard; Escape closes it before it can reach the PDF view's zoom reset.
- The overlay's input gets an accessible name equal to its placeholder: `Search document` here. Since the input is shared, the editor's becomes `Search buffer` and the shell's `Search transcript`.

### Visual consistency

- The overlay is the shared `LineFind` with its `.editor-find` styling, unchanged.
- Marks on the pages use the theme accent: every occurrence at low opacity, the occurrence behind the highlighted row at higher opacity. Both stay translucent so the page's own text shows through, and they are distinct from the text layer's blue selection color. Their rules live in the PDF plugin's own stylesheet, rooted in a `pdf-` class, so nothing outside the tab changes (`product/specs/pdf-tab.md` § Confined to its own tab).

### Code organization

- Client code stays in the PDF plugin's own directory, `web/src/plugins/pdf/`, per `ai/guidelines/react-code-organization.md`: grouping a page's text into lines (`pdf-find-lines.ts`) and finding occurrences in a drawn layer (`pdf-find-marks.ts`) live in React-free modules with colocated tests; the find state (`usePdfFind.ts`) and the marks (`usePdfFindMarks.ts`) live in hooks; `PdfTab.tsx` stays thin, only wiring the hooks to `LineFind` and the stage. The plugin imports `LineFind`, `useLineFind`, and `usePluginChordClaims` only from `web/src/plugins/api.ts`, and nothing from another plugin. The marks module copies the few lines of `paint` from the shell plugin rather than importing it, because a plugin may not import another plugin.
- The changes to the shared overlay (selecting the query on `Cmd+F`, the accessible name, a row label other than a line number, and an extra status row) are made in `web/src/shared/line-find/`, where the editor and shell already reach it.
- Everything here is view-local state (whether the overlay is open, its query, the highlighted row, the marks), which `ai/guidelines/architecture-principles.md` §1 lets the client own. The server's tab state is unchanged.

## Tests

- `src/plugins/declaration-validation.test.ts`: beside the pinned shell list, the PDF manifest's `chords` is `['meta+f']` and a declaration with it activates.
- `web/src/plugins/pdf/pdf-document.test.ts`: `readPageText` returns each item's string, `hasEOL`, and top fraction from the mocked PDF.js, and skips marked-content entries.
- `web/src/plugins/pdf/pdf-find-lines.test.ts`: items join into lines at each `hasEOL` and at the page end; empty lines are kept so indexes count `hasEOL`s; two identical lines stay two lines; a page with no items yields none; each line carries its page, index on the page, and first item's top.
- `web/src/plugins/pdf/pdf-find-marks.test.ts` (jsdom builds a layer of spans and `<br>`s by hand): occurrences are found case-insensitively, including one that crosses two spans of a line; nothing is found across a `<br>`; each range is tagged with its line index; `paintMarks` adds to and removes from stubbed `CSS.highlights` only its own ranges, and does nothing when the API is missing. Stub the API the way `web/src/plugins/shell/reply-selection.test.ts` does.
- `web/src/plugins/pdf/usePdfFind.test.ts`: lines fill in page by page with `reading` true until the last page; a page whose read rejects is skipped; reading happens once across two opens; nothing is read after unmount; `select` asks for the line's page and top fraction; `close` refocuses the remembered element and skips it once it has left the document.
- `web/src/plugins/pdf/PdfTab.test.tsx`, wrapped in `PluginChordProvider` with a registry as `ShellTab.test.tsx` does, and with `readPageText` on the mocked document: running the claimed `meta+f` opens the overlay with `Search document`; it opens nothing while loading or failed, yet the claim still answers; typing lists page-numbered rows; `Reading pages…` shows until reading finishes; highlighting a match on another page in single page shows that page; Return goes to the first ranked match; Escape closes the overlay without resetting zoom, and a second Escape resets zoom; Escape with focus outside the open overlay closes it; a tab with `active: false` does not answer the chord; switching tabs closes the overlay.
- `web/src/plugins/pdf/usePdfStageViewport` coverage in `PdfTab.test.tsx`: a jump with an offset in continuous layout sets the stage's scroll so the point sits a quarter of the stage's height from its top (jsdom reports no layout, so stub the page's and stage's `getBoundingClientRect` and the stage's `clientHeight` the way `usePdfKeys.test.ts` defines `clientHeight` on its stage and `PdfTab.test.tsx:233` spies on it, then assert the stage's `scrollTop`). A jump without an offset still calls the stubbed `scrollIntoView` (`PdfTab.test.tsx:107`).
- `web/src/plugins/pdf/pdf-styles.test.ts`: the containment checks keep passing with the `::highlight(…)` rules. Its "matches nothing the host draws" check strips a trailing pseudo-element with `/::[\w-]+$/`, which does not strip `::highlight(pdf-find-match)`; widen it to strip a parenthesized argument too.
- `web/src/shared/line-find/LineFind.test.tsx`: the input's accessible name equals its placeholder; `Cmd+F` in the input selects the whole query and is default-prevented; an `inputRef` receives the input; a `rowLabel` replaces the line number; the `status` line shows below results and in place of `No matching lines`, and not for an empty query.
- `web/src/editor/EditorTab.test.tsx` and `web/src/plugins/shell/ShellTab.test.tsx`: existing find tests still pass; any query by placeholder keeps working, since the accessible name equals it.

## Out of scope

- Writing to the document in any way (annotation, form filling, signing), as today.
- Regex, case-sensitive, or whole-word matching; the editor's matcher is used unchanged.
- Matches that span a line break, including hyphenated words.
- A match counter (`3 of 17`) or next / previous match buttons in the PDF header.
- A typed command that opens the overlay pre-filled, like the shell tab's `search transcript <pattern>`. A PDF tab has no command bar.
- Marking pages that contain matches in the page strip.
- A separate message for a document with no searchable text.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: `open` a multi-page PDF, press `Cmd+F`, and confirm the overlay reads `Search document`. Type a word that appears on several pages and confirm rows show page numbers and every occurrence on the shown page is marked, the current one more strongly. Step to a match on a later page with `↓` and confirm the page changes and the readout follows; switch to continuous scroll, highlight another match, and confirm its line sits a quarter of the way down. Press `Cmd+F` again and confirm the query is selected and no browser find bar appears. Zoom in, press Escape, and confirm the overlay closes, the marks clear, and zoom is unchanged; press Escape again and confirm zoom returns to 100%.
