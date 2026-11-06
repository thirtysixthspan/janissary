# PDF find hook, chord, overlay, and reveal

**Complexity: 5/10** — the integration spine of the feature. It adds an async read lifecycle, a plugin chord claim, the shared overlay in the PDF body, and a page-offset reveal that has to work in single-page and continuous layouts, with Escape and focus behavior that must not disturb zoom or the keys behind the overlay.

## Goal

`Cmd+F` on a visible PDF tab opens the shared find overlay over the whole document's text. Each row shows a 1-based page number, a muted reading status shows while pages are still being read, selecting a row moves the view to that line in either layout, and Escape, focus, tab switching, loading, and failed documents behave as the source plan's Moving to a match and States sections say.

## Design decisions and dependencies

`pdf-find-01-shared-overlay` and `pdf-find-02-pdf-text-lines` are already merged on this branch: `LineFind` (`web/src/shared/line-find/LineFind.tsx:78`) has the optional `inputRef`, `rowLabel`, and `status` props and its input-level `Cmd+F` (`LineFind.tsx:83`), and `pdf-document.ts` and `pdf-find-lines.ts` already export `readPageText`, `PdfTextItem`, `PdfLine`, and `pageLines`. Treat that code as present and do not edit it. `pdf-find-04-match-marks` depends on this subplan's `usePdfFind` state (`findOpen`, `query`, `current`), the existing stage ref, and the reveal behavior; it adds the `onTextLayer` plumbing itself, in `usePdfPageRender.ts`, `PdfPage.tsx`, and `PdfStage.tsx`. `pdf-find-05-specs-docs-and-verification` documents the result.

- `web/src/plugins/pdf/usePdfFind.ts` is a new hook. It takes one options object, `{ active, pdf, revealLine, inputRef }`, like `useShellTranscriptFind`'s input object: `pdf` is the loaded `LoadedPdf | null`, `revealLine(page, top)` asks the tab to show a line, and `inputRef` is the `React.RefObject<HTMLInputElement | null>` that `LineFind` also receives. It owns `lines: PdfLine[] | null` and `reading` as state and the remembered focused element plus a `started` flag as refs. It derives a parallel `string[] | null` of line texts with `useMemo` (`null` until the first open) and passes that to `useLineFind(lineTexts, active)`, because the shared hook matches strings and caps the results at ten. `result.index` indexes both arrays, so it maps straight back to the `PdfLine` at the same position. The options field is named `pdf` rather than `document` so it does not shadow the global `document` used for focus tracking.
- Matching is the editor's `contiguousMatch` (`web/src/shared/fuzzy-match.ts:120`): one uninterrupted, case-insensitive occurrence of the typed text, with no regex, case, or whole-word options. Ranking and tie-breaking are the shared matcher's, unchanged, and `useLineFind` caps the list at ten. There is no PDF-specific matcher and no second ranking rule.
- `open()` first handles an already-open overlay: it focuses `inputRef.current` and selects its whole value, then returns without calling `useLineFind`'s `open` or recording focus again. This is the source plan's second-`Cmd+F` behavior when focus had moved to the page, and it also covers a document that changed state while the overlay was up. Otherwise, `open()` does nothing when there is no loaded document. The chord handler guards on the same loaded value, so this is a second line of defense rather than the only one.
- On every closed-to-open transition, `open()` records the global `document.activeElement` in a ref when it is an `HTMLElement`; this is the element `close()` restores. It then calls `useLineFind`'s `open` with an empty query. If the `started` ref is still false, it sets `started` true, sets `lines` to an empty array, sets `reading` to whether the document has pages, and starts the read. If `started` is already true, it leaves `lines` and `reading` alone: a reopen after a finished read stays finished, and a reopen while the read is still running keeps the status true. A reopen after a close therefore records a fresh focus origin and resets the query, but keeps the lines already read and never starts a second read. Before the first open, `lines` is `null` and `reading` is false.
- The read is once per tab. It takes the page count from `pdf.pageSizes.length`, walks page indexes in order, awaits `readPageText` one page at a time, and appends that page's `pageLines(index, items)` with a functional state update after each page. It sets `reading` false after the last page; a page count of zero never starts the loop and leaves `reading` false. A second open never starts a second read. Switching tabs does not cancel it; only unmounting does.
- A page whose read rejects contributes nothing and sends no notification. The loop catches that page, checks the unmount flag, and continues with the next page when still mounted. A page that fails is best-effort in the same way a thumbnail that fails to draw does not fail the document.
- A document with no text at all produces an empty lines array and therefore `No matching lines` once reading finishes. There is no separate no-text state or message.
- The read stops on unmount. A `mounted` ref starts true, is set true by an effect and false by that effect's cleanup, so React StrictMode's mount-cleanup-mount replay leaves it true when the tab actually mounts. The page loop checks that ref after every await, including inside the catch, and breaks rather than applying state or starting the next page. The tab's teardown is when `usePdfDocument` destroys the document, so a read that rejects after teardown is caught and skipped. There is no separate destroyed flag on `LoadedPdf`, and this subplan does not add one.
- A new lines array is published after every page. That re-ranks once per page while a long document is read, which is cheap at document scale. Publishing at most once per animation frame is the documented upgrade if it ever shows, not part of this subplan.
- `select(index)` sets the highlighted row through `useLineFind`, looks up `find.results[index]`, maps its `index` to the concatenated `lines` array, and, when both exist, calls `revealLine(line.page, line.top)`. An out-of-range row or a missing line only updates the highlight and reveals nothing. It makes no text selection.
- `close()` calls `useLineFind`'s `close` and then refocuses the remembered element with `focus({ preventScroll: true })` when it is still connected, so restoring focus cannot undo a reveal by scrolling the stage. It also skips the refocus when `document.activeElement !== inputRef.current` and `isTextEntryElement(document.activeElement)` is true, using `isTextEntryElement` from `../api` (`web/src/plugins/api.ts:80`): the overlay's own input is allowed, but a sidebar search or another field must keep focus. Do not call `returnFocus` from `web/src/shared/overlay-focus.ts` as-is: it is the repo's focus-restore rule, but it treats the overlay's own input as a text entry and refuses to move focus away from it. A close caused by the tab becoming invisible goes through `useLineFind`'s `active` effect instead (`useLineFind.ts:42`), so it restores nothing.
- `current` is a memoized `{ page, line, start } | null` for the highlighted result, where `line` is the line's 0-based index on its page and `start` is the first range's start. It is derived from `find.results[find.selected]` and `lines`, and is null when there is no result, no matching line, or no range. `pdf-find-04-match-marks` uses it to paint the current occurrence more strongly.
- The returned API is `useLineFind`'s API with `open`, `select`, and `close` wrapped, plus `lines`, `reading`, and `current`. It does not return `inputRef`; the tab owns the ref and gives the same one to the hook and `LineFind`. The tab uses `select` rather than the raw `setSelected` so every move reveals.
- `PdfJump` is defined at `web/src/plugins/pdf/PdfStage.tsx:11` (`export type PdfJump`), not in `PdfTab.tsx` as the source plan's reuse table says. It gains an optional `offset`, a fraction of the page's height. `PdfTab`'s `goToPage(next, offset?)` (`PdfTab.tsx:35`) sets the page and a new jump token, and includes `offset` only when `offset !== undefined`, not when it is truthy, so a line at the very top of a page (`top: 0`) still takes the offset path. Header page changes, `pageBy`, `toggleLayout`, and thumbnail selection pass no offset.
- `usePdfStageViewport` keeps today's behavior when no offset is given: continuous layout calls `scrollIntoView({ block: 'start' })` on the target `.pdf-page`, and single-page layout does no scroll because it re-lists the page. With an offset, after the same stage and page-element lookup and returning when either is missing, in either layout it sets `stage.scrollTop` so the point that fraction down the page sits a quarter of the stage's client height from its top, and does not also call `scrollIntoView`. The arithmetic uses bounding rectangles, not `offsetTop`, because the stage is not the page's offset parent: the stage's current `scrollTop`, plus the page rectangle's top minus the stage rectangle's top, plus the offset times the page rectangle's height, minus a quarter of the stage's `clientHeight`. The browser's scroll limits clamp it. Check `jump.offset !== undefined`, not truthiness. Move the existing `layout !== 'continuous'` early return below the offset branch, or single-page reveals never scroll; single-page applies the offset after the page is listed, which the same render commit guarantees.
- `usePdfKeys` gains two trailing parameters after `handlers`: `overlayOpen: boolean` and `closeOverlay: () => void`. Escape prevents the default and, while the overlay is open, calls `closeOverlay` without resetting zoom; otherwise it resets zoom as today. Every other key is unchanged. Add `overlayOpen` and `closeOverlay` to the effect's dependency list. While focus is outside the open overlay, the arrow and page keys still work on the document; only Escape changes meaning.
- Focus inside the overlay is handled by `LineFind`. `rankedOverlayKeys` (`web/src/shared/ranked-overlay-keys.ts:21`) stops the event, so the PDF's global key listener never sees those keys. Focus outside the overlay reaches the global listener, which is why the close callback is enough for that case.
- After a continuous-layout reveal, the existing `IntersectionObserver` updates the position readout and the highlighted thumbnail as for any other scroll. Single-page layout already sets the page directly, so its readout follows the same `goToPage` call. No new observer code is needed.
- Production code imports `LineFind`, `useLineFind`, `usePluginChordClaims`, and `isTextEntryElement` only from `web/src/plugins/api.ts`, and nothing from another plugin. `usePdfFind.ts` imports `useLineFind` from `../api`, `PdfLine` and `pageLines` from its own `./pdf-find-lines`, and the `LoadedPdf` type from `./pdf-document`; `PdfTab.tsx` imports `LineFind` and `usePluginChordClaims` from `../api`. The marks module in `pdf-find-04-match-marks` copies the small highlight-painting pattern from the shell plugin for the same boundary reason.
- `src/plugins/pdf/manifest.ts` gains `chords: ['meta+f']`, with a comment in the shell manifest's style: the chord is claimed only while a PDF tab is the visible one, and the application leaves it to the editor everywhere else. No capability is added, the wire shape does not change (the existing `chords` field now carries one value), and `TAB_PLUGIN_API_VERSION` does not move because `chords` is already part of the declaration. `Ctrl+F` is not claimed and keeps its existing meaning.
- `web/src/plugins/pdf/pdf-tab-constants.ts` is not needed and must not be created. The client plugin boundary forbids importing `../shell/shell-tab-constants` (a plugin may reach only `../api`, `../shared.css`, `@shared/error-text`, its own `@shared/plugins/<id>/shared` contract, and its own files), but a plugin's own modules are allowed and the PDF tab has only one claimed chord. Pass `capabilities.claimedChords ?? []` to `usePluginChordClaims`; a fresh empty array on each render does not re-register the claim because the hook keys its effect on the joined chord string. The handler needs no `FIND_CHORD` branch: it answers the single claim the manifest declares, so a second copy of the chord id cannot disagree with the enforced claim. Tests use the literal `'meta+f'`, as `ShellTab.test.tsx` does.
- `PdfTab.tsx` calls `usePluginChordClaims('pdf', capabilities.label ?? 'pdf', capabilities.claimedChords ?? [], capabilities.active, handler)` with the same argument shape as `ShellTab.tsx`. The claim is registered whenever the tab is active and the manifest supplied a chord, so `Cmd+F` is swallowed while loading or failed too. The handler takes no chord argument (a zero-argument callback is assignable to `PluginChordHandler`); it does nothing unless the document is loaded, then calls `find.open()`. Add it after `usePdfFind` and `usePdfKeys`, because it closes over `find.open`.
- `PdfTab.tsx` renders `LineFind` as a direct child of `.pdf-tab`, after `.pdf-body` and conditional on `find.findOpen`, not inside `.pdf-body`. It passes `placeholder="Search document"`, the query/change/result/selected props, `onChangeSelected={find.select}`, `onClose={find.close}`, `rowLabel` returning the 1-based page for the row (`find.lines[result.index].page + 1`, guarded for a missing line), `status` set to `Reading pages…` while `find.reading`, and `inputRef={findInputRef}`. The empty query keeps the shared `type to search` hint, and a finished read with no match keeps `No matching lines`. The overlay uses `.picker`'s default absolute placement at the bottom, full width, at most 70% of the tab's height, with the shared background and shadow. `.tab-body > .picker` does not apply here because the PDF root is `.pdf-tab`, not `.tab-body`, so the default `bottom: 0` seats it at the tab's bottom. Because it is a sibling of `.pdf-body`, it spans the page strip too and narrows with the tab when the pane or a sidebar does.
- `web/src/plugins/pdf/pdf.css` gets `.pdf-tab { position: relative; }` in this subplan, because the overlay is rendered here and `.picker` is absolutely positioned. That is the only CSS change; the two highlight rules are `pdf-find-04-match-marks`, so this subplan does not add them, and `pdf-styles.test.ts` needs no change.
- `PdfTab.tsx` is 137 code lines today under `max-lines` (blank and comment lines skipped). These additions are roughly 30–35, so the file lands near 170 and no extraction is planned. If the lint run disagrees, move the metadata header and its controls into a `PdfHeader.tsx` beside it, as the source plan says. Keep that as a fallback, not a pre-emptive split.
- No server state changes. The manifest claim is the only server-side line, it already travels to the client as `claimedChords`, and no `TAB_PLUGIN_API_VERSION` bump is needed.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Find state | `web/src/shared/line-find/useLineFind.ts` (`useLineFind`, `findOpen`, `query`, `results`, `selected`, `open`, `close`, `setQuery`, `setSelected`; the active-close effect at `useLineFind.ts:42`) | Wrapped by `usePdfFind`. Its `active` effect already closes the overlay when the tab stops being visible. |
| Find overlay | `web/src/shared/line-find/LineFind.tsx` (`LineFind`, `inputRef`, `rowLabel`, `status`, input-level `Cmd+F` at `LineFind.tsx:83`), published from `web/src/plugins/api.ts` | Rendered with the props added in `pdf-find-01-shared-overlay`. |
| Overlay styling | `web/src/theme.css` `.picker` (`:572`), `.picker-empty` (`:588`), `.editor-find` (`:623`), `.editor-find-row` (`:628`), `.editor-find-line` (`:629`), `.editor-find-text` (`:631`) | Reused unchanged; the PDF only makes `.pdf-tab` its positioning context. |
| Focus capture and restore | `web/src/shared/overlay-focus.ts` (`focusedElement`, `returnFocus`); `isTextEntryElement` published from `web/src/plugins/api.ts:80` | `usePdfFind` records `document.activeElement` itself and focuses it back with `preventScroll`; it uses `isTextEntryElement` for the same don't-steal-from-another-field guard `returnFocus` applies. `returnFocus` itself is unsuitable while the overlay input still holds focus, because it refuses to move focus away from a text entry. |
| Chord claims | `usePluginChordClaims` at `web/src/plugins/PluginChords.tsx:71`, published from `web/src/plugins/api.ts`; `claimedChords` from `web/src/plugins/PluginBody.tsx:156`; `chords` in `src/plugins/api.ts:113` | The PDF claim is registered exactly as the shell's is. |
| Chord routing | `web/src/useWindowKeys.ts` (`chordTabLabel` at `:164`, `handleChordKeys` at `:170`, claimed-chord `preventDefault` at `:175`) | No edit. Focus on the page names the current plugin tab, and a claim that runs prevents the browser default. |
| Shell transcript find | `web/src/plugins/shell/useShellTranscriptFind.ts` (`useShellTranscriptFind`), `ShellTab.tsx:224` | Model for a plugin wrapping `useLineFind`, a `select(index)` that reveals, and rendering `LineFind` with a placeholder. The PDF differs by reading asynchronously and by revealing a page offset. |
| Page jumps | `web/src/plugins/pdf/PdfStage.tsx:11` (`PdfJump`), `PdfTab.tsx:35` (`goToPage`), `usePdfStageViewport.ts:63` (the token-driven jump effect) | Extended with the optional offset. |
| PDF keys | `web/src/plugins/pdf/usePdfKeys.ts:33` (the Escape branch) | Extended with the overlay state and close callback. |
| PDF text reading | `web/src/plugins/pdf/pdf-document.ts:118` (`readPageText`), `web/src/plugins/pdf/pdf-find-lines.ts:14` (`pageLines`, `PdfLine`), from `pdf-find-02-pdf-text-lines` | The hook's only source of lines. |
| Chord test provider | `web/src/plugins/PluginChords.tsx` (`PluginChordProvider`, `createPluginChordRegistry`), used in `web/src/plugins/shell/ShellTab.test.tsx:265` and `:295` | `PdfTab.test.tsx` imports the same two and wraps every render; `usePluginChordClaims` throws without a provider. |

## Proposed changes

- Create `web/src/plugins/pdf/usePdfFind.ts` with the hook described above, taking the options object. Keep it React and DOM only, no PDF.js import; it reads through the `LoadedPdf` value and imports `useLineFind` and `isTextEntryElement` from `../api`.
- In `web/src/plugins/pdf/PdfStage.tsx`, add `offset?: number` to `PdfJump` at `PdfStage.tsx:11`. No other stage change.
- In `web/src/plugins/pdf/usePdfStageViewport.ts`, add `offset?: number` to the structural `StageJump` type (`usePdfStageViewport.ts:6`) and implement the offset branch described above. Move the `layout !== 'continuous'` early return below it. Keep the no-offset path exactly as it is today.
- In `web/src/plugins/pdf/usePdfKeys.ts`, append `overlayOpen` and `closeOverlay` after `handlers` (`usePdfKeys.ts:24`). Change only the Escape branch and the effect dependency list.
- In `web/src/plugins/pdf/PdfTab.tsx`, order the body as `goToPage`, `revealLine`, `findInputRef`, `usePdfFind`, `handlers`, `usePdfKeys`, then the chord claim. Extend `goToPage` with the optional offset, call `usePdfFind`, pass the overlay state and close callback to `usePdfKeys`, register the chord claim, and render `LineFind`. Do not create a constants module.
- In `web/src/plugins/pdf/pdf.css`, add `.pdf-tab { position: relative; }` and nothing else.
- Add `chords: ['meta+f']` and its comment to `src/plugins/pdf/manifest.ts`.
- Create `web/src/plugins/pdf/usePdfFind.test.ts` for the hook and update `web/src/plugins/pdf/usePdfKeys.test.ts` for the new parameters and the overlay Escape cases.
- Wrap every `PdfTab` render in `web/src/plugins/pdf/PdfTab.test.tsx` in `PluginChordProvider`. Have `mount` create and return one registry, and make the `renderTab` helper take that registry so a rerender in the switching test does not replace it; the direct render in the scrolling test creates its own registry. Give the test capabilities `label: 'pdf1'` and `claimedChords: ['meta+f']` so `chords.run('meta+f', 'pdf1')` drives the claim.
- In `src/plugins/declaration-validation.test.ts`, import `pdfManifest` from `./pdf/manifest.js` and add the PDF assertions beside the pinned shell list.
- Do not edit `web/src/shared/line-find/*`, `web/src/plugins/api.ts`, `PluginChords.tsx`, `PluginBody.tsx`, `useWindowKeys.ts`, `pdf-document.ts`, `pdf-find-lines.ts`, `PdfPage.tsx`, `usePdfPageRender.ts`, `usePdfDocument.ts`, `PdfThumbnails.tsx`, or `PdfStage.tsx` beyond the `PdfJump` type.

## Tests

In `web/src/plugins/pdf/usePdfFind.test.ts`, using a fake `LoadedPdf`, deferred page reads, and a real input attached to `inputRef`:

- Lines fill in page by page, and `reading` is true until the last page resolves.
- A page whose read rejects is skipped, and later pages still contribute; a rejected first page leaves `reading` true until the rest finish, and `reading` is false after the last page even when that page rejects.
- Reading happens once across two opens: open, finish, close, open again, and assert each page was read once, the second open keeps the lines, and `reading` is still false.
- Closing and reopening while a read is still in progress keeps `reading` true, keeps the lines read so far, and does not restart the page walk.
- Nothing is applied after unmount: start a read, unmount, resolve the deferred pages, and assert the next page is never read and the page-read count stays at one.
- `select` asks for the matching line's page and top fraction, including a line whose top is 0.
- `close` refocuses the remembered element with `preventScroll: true`, skips it once it has left the document, and skips it when another text field holds focus.
- Opening while already open focuses the input, selects the query, leaves the query unchanged, does not read again, and does not replace the remembered focus origin.
- A null document makes `open` a no-op.
- `current` reports the selected result's page, line index on the page, and range start; it is null with no results.
- Before the first open, `lines` is null and `reading` is false.

In `web/src/plugins/pdf/PdfTab.test.tsx`, wrapped in `PluginChordProvider` with a registry, and with `readPageText` on the mocked document:

- Running the claimed `meta+f` for the tab's label opens the overlay with `Search document` as its accessible name and placeholder.
- With the overlay open and focus outside its input, the claimed `meta+f` focuses the input and selects the query without resetting it or reading again.
- While loading (a pending `loadPdf` mock, rendered directly rather than through `mount`) and after a failed load, the claim still returns true, but no overlay opens; await the header or the failure text first so the claim effect has registered.
- Typing lists page-numbered rows.
- `Reading pages…` shows until the last page is read, both below results and in place of `No matching lines` when there are none yet.
- Highlighting a match on another page in single-page layout shows that page and updates the position readout.
- Return moves to the first ranked match even when another row is highlighted, and the overlay stays open.
- Escape closes the overlay without resetting zoom (the `110%` badge stays), and a second Escape resets zoom (the badge disappears).
- Escape with focus outside the open overlay closes it and leaves zoom unchanged; move focus off the input (blur it or focus a header button) before dispatching Escape.
- A tab with `active: false` does not answer the chord.
- Switching tabs closes the overlay; after the read finishes, rerender with `active: false`, then `active: true`, run the chord, and assert a fresh empty input.

In `web/src/plugins/pdf/PdfTab.test.tsx`, for the viewport behavior:

- A jump with an offset in continuous layout sets the stage's `scrollTop` so the point sits a quarter of the stage's height from its top. Drive it through a find result: open with the claimed chord, type a query that matches a line on a later page, press Enter, stub the page's and stage's `getBoundingClientRect` and the stage's `clientHeight`, following the `clientHeight` spy at `PdfTab.test.tsx:234`, then assert `scrollTop`.
- A jump with an offset in single-page layout lists the target page first and then sets the same scroll position.
- A jump without an offset still calls the stubbed `scrollIntoView`. The stub is at `PdfTab.test.tsx:108`; no current test asserts it, so add the assertion by clicking a thumbnail in continuous layout.

In `web/src/plugins/pdf/usePdfKeys.test.ts`:

- Escape with the overlay closed resets zoom, as today.
- Escape with the overlay open calls the close callback and does not reset zoom.
- The arrow and page keys keep their current behavior in both states.

In `src/plugins/declaration-validation.test.ts`:

- Import `pdfManifest` from `./pdf/manifest.js`; assert `pdfManifest.chords` equals `['meta+f']` beside the pinned shell list at `declaration-validation.test.ts:159`.
- A declaration carrying `pdfManifest.chords` activates.
- The shell's pinned list is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:server -- src/plugins/declaration-validation.test.ts`

`npm run test:client -- web/src/plugins/pdf/usePdfFind.test.ts web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfKeys.test.ts web/src/plugins/pdf/pdf-styles.test.ts`

`npm run typecheck:diff`

Manual check in the running app with a multi-page PDF: press `Cmd+F`, confirm the overlay says `Search document`, type a word found on several pages, and confirm the rows show page numbers. Step to a later page with the down arrow and confirm the page changes and the readout follows. Switch to continuous scroll, highlight another match, and confirm the line sits about a quarter of the way down. Press `Cmd+F` again and confirm the query is selected and no browser find bar appears. Press Escape twice and confirm the first closes the overlay without changing zoom and the second resets zoom. Click the page so focus leaves the overlay, press Escape, and confirm only the overlay closes and the arrow and page keys still work. Switch to another tab and back, press `Cmd+F`, and confirm the overlay opens empty. While a PDF is still loading and after a failed load, confirm `Cmd+F` does nothing and the browser find bar does not appear. During marking work in the next subplan, this check covers the overlay and reveal only; marks are verified there.

## Out of scope

- Match marks, the highlight API, and the highlight CSS. Those are `pdf-find-04-match-marks`.
- The text-layer callback and its page-render plumbing (`onTextLayer` in `usePdfPageRender.ts`, `PdfPage.tsx`, and `PdfStage.tsx`). Those are `pdf-find-04-match-marks`.
- The PDF spec, help, and user docs. Those are `pdf-find-05-specs-docs-and-verification`, except the editor and shell spec lines already made in `pdf-find-01-shared-overlay`.
- Server tab state, wire-shape changes, new capabilities, or a `TAB_PLUGIN_API_VERSION` bump. The manifest chord is the only server edit.
- A match counter, next and previous buttons, or a page-strip match indicator.
- Regex, case-sensitive, or whole-word matching. The shared contiguous matcher is used unchanged.
- Matches across a line break or a hyphenated word.
- A command that opens the overlay pre-filled. The PDF tab has no command bar.
- Any write to the document.
- A new constants module, a plugin API export for focus helpers, or changes to the shared overlay, `useLineFind`, `rankedOverlayKeys`, `PluginChords`, `PluginBody`, or `useWindowKeys`.
