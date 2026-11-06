# PDF find specs, help, user docs, and end-to-end verification

**Complexity: 2/10** — documentation only, but it spans six files and the new PDF spec section has to carry every behavior decision from the source plan. The end-to-end manual check is the last gate on the feature.

## Goal

Replace the PDF spec's "no in-document search" sentence with a full Find section, update the keyboard, help, and user docs that name `Cmd+F`, and run the feature end to end once the code subplans have landed.

## Design decisions and dependencies

This subplan depends on `pdf-find-01-shared-overlay`, `pdf-find-02-pdf-text-lines`, `pdf-find-03-find-hook-and-overlay`, and `pdf-find-04-match-marks`. It documents behavior that exists, not behavior that is planned. `pdf-find-01-shared-overlay` already made the editor and shell spec lines, so they are not repeated here.

- `product/specs/pdf-tab.md` is authoritative for the feature. Replace the single sentence at line 156, "There is no in-document search: no find field, no match navigation, and no match highlighting.", with a new `### Find` section after `### Text selection`.
- The Find section covers, in this order: the `Cmd+F` binding and that it applies only while a PDF tab is visible; the plugin chord claim and the application's ownership everywhere else; that `Ctrl+F` keeps its existing meaning; the shared overlay, which holds the keyboard while it is open, and the editor's contiguous, case-insensitive matching with no options and at most ten ranked rows; the whole document being searched, not just drawn pages; one visual line per row, two identical lines remaining two rows, and the documented no-cross-line and no-hyphen limitation; a document with no text answering every query with `No matching lines` and having no separate message; an unreadable page contributing no lines and no notification; `Cmd+F` doing nothing while loading or failed but still swallowing the key; and the text being read once per tab on the first open and kept until the tab closes.
- The same section covers the results and movement decisions: the `Search document` placeholder, the `type to search` empty state, `No matching lines`, the 1-based page label, the top-ten cap, the reading status, the single-page and continuous reveal, the quarter-height position, the readout and thumbnail following, no text selection being made, Return moving to the first ranked match, Escape closing without resetting zoom and the second Escape resetting it, Escape closing the overlay when focus is outside it, and switching tabs closing it with a fresh empty one on return.
- The same section covers marks: every occurrence on drawn pages while the query is non-empty, the highlighted row's occurrence stronger, pages drawn later getting marks, and closing clearing them. It records that the marks use the theme accent at low and higher translucency, stay distinct from the text layer's blue selection, and stay inside the PDF tab. It also records the accessible name.
- `product/specs/keyboard-navigation.md` line 26 changes its Cmd+Shift+F row so "Distinct from Cmd+F, which searches an editor buffer or a shell tab's transcript" also names a PDF tab's document.
- `help/keys.md` line 28 changes the general `Cmd+F` row, "Search for a line in an editor buffer or a shell tab's transcript", to name a PDF tab's document. The file has no PDF section today, so no new table is added.
- `documentation/user-documentation/tab-types/pdf-viewer.md` line 55 replaces "There is no in-app copy button, and no find field, searching inside a document isn't supported yet." with a short find section. It stays user-facing: `Cmd+F`, the `Search document` field, page-numbered rows, the arrow keys, Return, Escape, and marks, with no module names or internals.
- `documentation/user-documentation/getting-started/keyboard.md` line 36 changes the `Cmd+F` row's "does nothing in other tabs" so the PDF tab is named as a tab where it works.
- `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search are already updated by `pdf-find-01-shared-overlay`. Read them here to confirm the wording matches the final behavior; do not duplicate the edits.
- The spec quotes observable text exactly: `Search document`, `type to search`, `No matching lines`, and `Reading pages…`. Check each against the code with a plain search before finishing.
- Keep natural line breaks. Do not add em dashes to prose. User docs follow the existing page's tone and do not name files, functions, or internal classes.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| PDF behavior spec | `product/specs/pdf-tab.md` § Text selection, line 156 | The "no search" sentence is replaced by the new Find section. The surrounding sections stay as they are. |
| Editor find spec | `product/specs/editor-tab.md` § Finding a line | Updated in `pdf-find-01-shared-overlay`; re-read for consistency. |
| Shell find spec | `product/specs/shell-tab.md` § Transcript search | Updated in `pdf-find-01-shared-overlay`; re-read for consistency. |
| Keyboard spec | `product/specs/keyboard-navigation.md` line 26 | The Cmd+Shift+F row gains the PDF tab. |
| Help key table | `help/keys.md` line 28 | The general Cmd+F row gains the PDF tab. No PDF section is added. |
| PDF user page | `documentation/user-documentation/tab-types/pdf-viewer.md` line 55 | The stale "no find field" sentence becomes a short find section. |
| Keyboard user page | `documentation/user-documentation/getting-started/keyboard.md` line 36 | The Cmd+F row names the PDF tab. |
| Implementation | `web/src/plugins/pdf/` and `web/src/shared/line-find/` | The behavior described must match the code from `pdf-find-01` through `pdf-find-04`. |

## Proposed changes

- Edit `product/specs/pdf-tab.md` to replace line 156 with the `### Find` section described above.
- Edit `product/specs/keyboard-navigation.md` line 26.
- Edit `help/keys.md` line 28.
- Edit `documentation/user-documentation/tab-types/pdf-viewer.md` line 55.
- Edit `documentation/user-documentation/getting-started/keyboard.md` line 36.
- Re-read `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search and correct only a mismatch with the landed shared overlay behavior.
- Do not edit `product/specs/pdf-tab.md` § Text selection, § Confined to its own tab, or § When a document cannot be rendered beyond what the Find section needs to reference.
- Do not add a PDF section to `help/keys.md`, a changelog entry, or a developer-doc topic. The manifest chord is not a plugin API change.

## Tests

No new test files. The existing documentation checks must pass; in particular, `src/plugins/documentation.test.ts` reads capability facts and the changelog's capability count, and neither changes here.

Before finishing, check the new spec against the source plan section by section. Every Design decisions bullet, every "What is searched" bullet, every Results bullet, every "Moving to a match" bullet, every "Match highlighting" bullet, the UI design states, and the keyboard and accessibility rules must appear exactly once in the spec or be explicitly deferred to Out of scope. Check that the spec names the same strings the code renders: `Search document`, `type to search`, `No matching lines`, and `Reading pages…`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual end-to-end check in the running app:

1. `open` a multi-page PDF that has selectable text, press `Cmd+F`, and confirm the overlay reads `Search document`, the input is focused, and the empty state is `type to search`.
2. Type a word that appears on several pages. Confirm the rows show 1-based page numbers and the matched text is emphasized, and that every occurrence on the shown page is marked with the current row's occurrence stronger.
3. Press `Down` to a match on a later page and confirm the shown page changes, the position readout follows, and the page strip's thumbnail follows when the strip is open.
4. Switch to continuous scroll, highlight another match, and confirm its line sits about a quarter of the way down the stage.
5. Zoom past 100%, highlight a match, and confirm the stage scrolls to the same quarter position.
6. Press `Cmd+F` again and confirm the query is selected, the overlay stays open, and no browser find bar appears.
7. Press `Escape` and confirm the overlay closes, the marks clear, the view stays on the last previewed match, and zoom is unchanged. Press `Escape` again and confirm zoom returns to 100%.
8. Click the page so focus leaves the overlay while it is open, press `Escape`, and confirm only the overlay closes. Then confirm the arrow and page keys move the document.
9. Switch to another tab and back, press `Cmd+F`, and confirm the overlay opens empty.
10. Try a scanned PDF with no text and confirm every query answers `No matching lines`, with no separate message.
11. Try a document while it is still loading and after a failed load, and confirm `Cmd+F` does nothing there and the browser find bar does not appear.

If two PDF tabs can be placed in a split, confirm each keeps its own marks and closing one leaves the other's marks in place.

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
- Any behavior not already implemented by `pdf-find-01` through `pdf-find-04`. If the spec finds a gap, it goes back to the subplan that owns it rather than being written as future behavior.
