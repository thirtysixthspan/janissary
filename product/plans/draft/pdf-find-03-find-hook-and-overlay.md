# PDF find hook, chord, overlay, and reveal

**Complexity: 5/10** — the integration spine of the feature. It adds an async read lifecycle, a plugin chord claim, the shared overlay in the PDF body, and a page-offset reveal that has to work in single-page and continuous layouts, with Escape and focus behavior that must not disturb zoom or the keys behind the overlay.

## Goal

`Cmd+F` on a visible PDF tab opens the shared find overlay over the whole document's text. Rows show a page number and a reading status, selecting a row moves the view to that line in either layout, and Escape, focus, tab switching, loading, and failed documents behave as the PDF spec will say.

## Design decisions and dependencies

This subplan depends on `pdf-find-01-shared-overlay`, which adds the overlay's `inputRef`, `rowLabel`, `status`, and in-input `Cmd+F` handling, and on `pdf-find-02-pdf-text-lines`, which adds `readPageText` and `pageLines`. `pdf-find-04-match-marks` depends on this subplan's `usePdfFind` state, stage ref, and `onTextLayer` point. `pdf-find-05-specs-docs-and-verification` documents the result.

- `web/src/plugins/pdf/usePdfFind.ts` is a new hook. It takes `active`, the loaded `pdf` (a `LoadedPdf | null`), a `revealLine(page, top)` callback, and an `inputRef`. It owns `lines: PdfLine[] | null`, `reading`, the remembered focused element, and a `started` flag. It derives a parallel `string[]` of line texts with `useMemo` and passes that to `useLineFind(lines, active)`, because the shared hook matches strings and caps the results at ten. `result.index` indexes both arrays, so it maps straight back to the `PdfLine` at the same position. The parameter is named `pdf` rather than `document` so it does not shadow the global `document` used for focus tracking.
- Matching is the editor's `contiguousMatch`: one uninterrupted, case-insensitive occurrence of the typed text, with no regex, case, or whole-word options. Ranking and tie-breaking are the shared matcher's, unchanged, and `useLineFind` caps the list at ten. There is no PDF-specific matcher and no second ranking rule.
- `open()` does nothing when there is no loaded document. The chord handler also guards, so this is a second line of defense rather than the only one.
- If the overlay is already open, `open()` does not reopen it or reset the query. It focuses the input through `inputRef` and selects the whole value, which is the source plan's second-`Cmd+F` behavior when focus had moved to the page.
- On the first real open, `open()` records the global `document.activeElement` when it is an `HTMLElement`, calls `useLineFind`'s `open` with an empty query, sets `lines` to an empty array, and starts the read if it has not started.
- The read is once per tab. It walks page indexes in order, awaits `readPageText` one page at a time, and appends that page's `pageLines` as a new array after each page. It sets `reading` false after the last page, or after a page count of zero. A second open never starts a second read.
- A page whose read rejects contributes nothing and sends no notification. The loop catches that page and continues with the next. A page that fails is best-effort in the same way a thumbnail that fails to draw does not fail the document.
- A document with no text at all produces an empty lines array and therefore `No matching lines` once reading finishes. There is no separate no-text state or message.
- The read stops on unmount. The tab's teardown is when `usePdfDocument` destroys the document, so an unmount flag checked after every await is the practical stop; a read that rejects after teardown is caught and skipped. There is no separate destroyed flag on `LoadedPdf`, and this subplan does not add one.
- A new lines array is published after every page. That re-ranks once per page while a long document is read, which is cheap at document scale. Publishing at most once per animation frame is the documented upgrade if it ever shows, not part of this subplan.
- `select(index)` sets the highlighted row through `useLineFind`, maps the result's `index` back to the concatenated `lines` array, and calls `revealLine(line.page, line.top)`. It makes no text selection.
- `close()` closes the overlay and refocuses the remembered element when it is still connected. A close caused by the tab becoming invisible goes through `useLineFind`'s `active` effect instead, so it restores nothing.
- `current` is a memoized `{ page, line, start } | null` for the highlighted result, where `line` is the line's index on its page and `start` is the first range's start. `pdf-find-04-match-marks` uses it to paint the current occurrence more strongly. It is derived from `find.results[find.selected]` and `lines`.
- The returned API is `useLineFind`'s API with `open`, `select`, and `close` wrapped, plus `lines`, `reading`, `current`, and `inputRef`. The tab uses `select` rather than the raw `setSelected` so every move reveals.
- `PdfJump` is defined in `web/src/plugins/pdf/PdfStage.tsx`, not in `PdfTab.tsx` as the source plan's reuse table says. It gains an optional `offset`, a fraction of the page's height. `PdfTab`'s `goToPage(next, offset?)` sets the page and a new jump token, and includes `offset` only when one is given. Header and thumbnail page changes pass no offset.
- `usePdfStageViewport` keeps today's behavior when no offset is given: continuous layout calls `scrollIntoView({ block: 'start' })`, and single-page layout does no scroll because it re-lists the page. With an offset, in either layout, it scrolls the stage so the point that fraction down the page sits a quarter of the stage's client height from its top. The arithmetic uses bounding rectangles, not `offsetTop`, because the stage is not the page's offset parent: the stage's current `scrollTop`, plus the page rectangle's top minus the stage rectangle's top, plus the offset times the page rectangle's height, minus a quarter of the stage's `clientHeight`. The browser's scroll limits clamp it. Single-page applies it after the page is listed, which the same render commit guarantees.
- `usePdfKeys` takes the overlay's open state and a close callback. Escape prevents the default and, while the overlay is open, closes it without resetting zoom; otherwise it resets zoom as today. Every other key is unchanged. While focus is outside the open overlay, the arrow and page keys still work on the document; only Escape changes meaning.
- Focus inside the overlay is handled by `LineFind`. `rankedOverlayKeys` stops the event, so the PDF's global key listener never sees those keys. Focus outside the overlay reaches the global listener, which is why the close callback is enough for that case.
- After a continuous-layout reveal, the existing `IntersectionObserver` updates the position readout and the highlighted thumbnail as for any other scroll. Single-page layout already sets the page directly, so its readout follows the same `goToPage` call. No new observer code is needed.
- The plugin imports `LineFind`, `useLineFind`, and `usePluginChordClaims` only from `web/src/plugins/api.ts`, and nothing from another plugin. The marks module in `pdf-find-04-match-marks` copies the small highlight-painting pattern from the shell plugin for that reason.
- `src/plugins/pdf/manifest.ts` gains `chords: ['meta+f']`, with a comment in the shell manifest's style: the chord is claimed only while a PDF tab is the visible one, and the application leaves it to the editor everywhere else. No capability is added and the wire does not change. `Ctrl+F` is not claimed and keeps its existing meaning.
- `web/src/plugins/pdf/pdf-tab-constants.ts` is a new module beside the tab, mirroring `shell-tab-constants.ts`. It exports `FIND_CHORD = 'meta+f'` and a shared empty `NO_CHORDS` array. This avoids importing another plugin's constants, which the plugin boundary forbids.
- `PdfTab.tsx` calls `usePluginChordClaims('pdf', capabilities.label ?? 'pdf', capabilities.claimedChords ?? NO_CHORDS, capabilities.active, handler)` with the same argument shape as `ShellTab.tsx`. The claim is registered whenever the tab is active and the manifest supplied a chord, so `Cmd+F` is swallowed while loading or failed too. The handler does nothing unless the document is loaded, then calls `find.open()`.
- `PdfTab.tsx` renders `LineFind` after `.pdf-body`, conditional on `find.findOpen`. It passes `Search document`, the query/change/result/selected props, `onChangeSelected={find.select}`, `onClose={find.close}`, `rowLabel` returning `String(line.page + 1)`, `status` set to `Reading pages…` while `reading`, and `inputRef`. The empty query keeps the shared `type to search` hint, and a finished read with no match keeps `No matching lines`. The overlay uses the existing `.picker` placement: absolute at the bottom, full width, at most 70% of the tab's height, with the shared background and shadow. Because `.pdf-tab` owns the positioning context and the overlay is a sibling of `.pdf-body`, it spans the page strip too and narrows with the tab when the pane or a sidebar does.
- `web/src/plugins/pdf/pdf.css` gets `.pdf-tab { position: relative; }` in this subplan, because the overlay is rendered here and `.picker` is absolutely positioned. The two highlight rules are `pdf-find-04-match-marks`, so this subplan does not add them.
- `PdfTab.tsx` has about 137 code lines today under `max-lines`. These additions are roughly 30, so no extraction is planned. If the lint run disagrees, move the metadata header and its controls into a `PdfHeader.tsx` beside it, as the source plan says. Keep that as a fallback, not a pre-emptive split.
- No server state changes. The manifest claim is the only server-side line, and it already travels to the client as `claimedChords`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Find state | `web/src/shared/line-find/useLineFind.ts` (`useLineFind`, `findOpen`, `query`, `results`, `selected`, `open`, `close`, `setQuery`, `setSelected`) | Wrapped by `usePdfFind`. Its `active` effect already closes the overlay when the tab stops being visible. |
| Find overlay | `web/src/shared/line-find/LineFind.tsx`, published from `web/src/plugins/api.ts` | Rendered with the props added in `pdf-find-01-shared-overlay`. |
| Chord claims | `usePluginChordClaims` in `web/src/plugins/PluginChords.tsx`, published from `web/src/plugins/api.ts`; `claimedChords` from `web/src/plugins/PluginBody.tsx`; `chords` in `src/plugins/api.ts` | The PDF claim is registered exactly as the shell's is. |
| Chord routing | `web/src/useWindowKeys.ts` (`chordTabLabel`, `handleChordKeys`) | No edit. Focus on the page names the current plugin tab, and a claim that runs prevents the browser default. |
| Shell transcript find | `web/src/plugins/shell/useShellTranscriptFind.ts`, `ShellTab.tsx` | Model for a plugin wrapping `useLineFind`, a `select(index)` that reveals, and rendering `LineFind` with a placeholder. The PDF differs by reading asynchronously and by revealing a page offset. |
| Page jumps | `web/src/plugins/pdf/PdfStage.tsx` (`PdfJump`), `PdfTab.tsx` (`goToPage`), `usePdfStageViewport.ts` | Extended with the optional offset. |
| PDF keys | `web/src/plugins/pdf/usePdfKeys.ts` | Extended with the overlay state and close callback. |
| PDF text reading | `readPageText`, `pageLines`, `PdfLine` from `pdf-find-02-pdf-text-lines` | The hook's only source of lines. |
| Chord test provider | `PluginChordProvider` and `createPluginChordRegistry` in `web/src/plugins/shell/ShellTab.test.tsx` | `PdfTab.test.tsx` needs the same wrapper once `PdfTab` calls `usePluginChordClaims`. |

## Proposed changes

- Create `web/src/plugins/pdf/usePdfFind.ts` with the hook described above. Keep it React and DOM only, no PDF.js import.
- Create `web/src/plugins/pdf/pdf-tab-constants.ts` with `FIND_CHORD` and `NO_CHORDS`.
- Add `chords: ['meta+f']` and its comment to `src/plugins/pdf/manifest.ts`.
- In `web/src/plugins/pdf/PdfStage.tsx`, add `offset?: number` to `PdfJump`.
- In `web/src/plugins/pdf/usePdfStageViewport.ts`, add `offset?` to the structural `StageJump` type and implement the offset branch described above. Keep the no-offset path exactly as it is today.
- In `web/src/plugins/pdf/usePdfKeys.ts`, add `overlayOpen: boolean` and `closeOverlay: () => void` parameters. Change only the Escape branch.
- In `web/src/plugins/pdf/PdfTab.tsx`, add the `revealLine` callback, call `usePdfFind`, pass the overlay state and close callback to `usePdfKeys`, register the chord claim, and render `LineFind`. Extend `goToPage` with the optional offset.
- In `web/src/plugins/pdf/pdf.css`, add `.pdf-tab { position: relative; }`.
- Update `web/src/plugins/pdf/usePdfKeys.test.ts` for the new parameters and add the overlay Escape cases.
- Wrap every `PdfTab` render in `PdfTab.test.tsx` in `PluginChordProvider`. Both `mount` and the direct render in the scrolling test need it. Give the test capabilities a label such as `pdf1` and `claimedChords: ['meta+f']` so the registry can be driven.

## Tests

In `web/src/plugins/pdf/usePdfFind.test.ts`, using a fake `LoadedPdf`, deferred page reads, and a real input attached to `inputRef`:

- Lines fill in page by page, and `reading` is true until the last page resolves.
- A page whose read rejects is skipped, and later pages still contribute.
- Reading happens once across two opens: open, finish, close, open again, and assert each page was read once.
- Nothing is applied after unmount: start a read, unmount, resolve the deferred pages, and assert no state update and no further reads.
- `select` asks for the matching line's page and top fraction.
- `close` refocuses the remembered element, and skips it once it has left the document.
- Opening while already open focuses the input and selects the query without resetting it and without reading again.
- A null document makes `open` a no-op.
- `current` reports the selected result's page, line index on the page, and range start.

In `web/src/plugins/pdf/PdfTab.test.tsx`, wrapped in `PluginChordProvider` with a registry, and with `readPageText` on the mocked document:

- Running the claimed `meta+f` for the tab's label opens the overlay with `Search document` as its accessible name and placeholder.
- While loading and after a failed load, the claim still answers, but no overlay opens.
- Typing lists page-numbered rows.
- `Reading pages…` shows until the last page is read, both below results and in place of `No matching lines` when there are none yet.
- Highlighting a match on another page in single-page layout shows that page and updates the position readout.
- Return moves to the first ranked match even when another row is highlighted, and the overlay stays open.
- Escape closes the overlay without resetting zoom, and a second Escape resets zoom.
- Escape with focus outside the open overlay closes it and leaves zoom unchanged.
- A tab with `active: false` does not answer the chord.
- Switching tabs closes the overlay, and `Cmd+F` on return opens a fresh, empty one.

In `web/src/plugins/pdf/PdfTab.test.tsx`, for the viewport behavior:

- A jump with an offset in continuous layout sets the stage's `scrollTop` so the point sits a quarter of the stage's height from its top. Stub the page's and stage's `getBoundingClientRect` and the stage's `clientHeight`, following `usePdfKeys.test.ts` and the existing `PdfTab.test.tsx` clientHeight spy, then assert `scrollTop`.
- A jump with an offset in single-page layout lists the target page first and then sets the same scroll position.
- A jump without an offset still calls the stubbed `scrollIntoView`, as the existing test at `PdfTab.test.tsx:107` expects.

In `web/src/plugins/pdf/usePdfKeys.test.ts`:

- Escape with the overlay closed resets zoom, as today.
- Escape with the overlay open calls the close callback and does not reset zoom.
- The arrow and page keys keep their current behavior in both states.

In `src/plugins/declaration-validation.test.ts`:

- The PDF manifest's `chords` equals `['meta+f']`, beside the pinned shell list.
- A declaration carrying that chord activates.
- The shell's pinned list is unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:server -- src/plugins/declaration-validation.test.ts`

`npm run test:client -- web/src/plugins/pdf/usePdfFind.test.ts web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfKeys.test.ts`

`npm run typecheck:diff`

Manual check in the running app with a multi-page PDF: press `Cmd+F`, confirm the overlay says `Search document`, type a word found on several pages, and confirm the rows show page numbers. Step to a later page with the down arrow and confirm the page changes and the readout follows. Switch to continuous scroll, highlight another match, and confirm the line sits about a quarter of the way down. Press `Cmd+F` again and confirm the query is selected and no browser find bar appears. Press Escape twice and confirm the first closes the overlay without changing zoom and the second resets zoom. During marking work in the next subplan, this check covers the overlay and reveal only; marks are verified there.

## Out of scope

- Match marks, the highlight API, and the highlight CSS. Those are `pdf-find-04-match-marks`.
- The PDF spec, help, and user docs. Those are `pdf-find-05-specs-docs-and-verification`, except the editor and shell spec lines already made in `pdf-find-01-shared-overlay`.
- Server tab state, wire changes, or new capabilities. The manifest chord is the only server edit.
- A match counter, next and previous buttons, or a page-strip match indicator.
- Regex, case-sensitive, or whole-word matching. The shared contiguous matcher is used unchanged.
- Matches across a line break or a hyphenated word.
- A command that opens the overlay pre-filled. The PDF tab has no command bar.
- Any write to the document.
