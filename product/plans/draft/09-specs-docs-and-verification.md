# Update the quit specs and user documentation, then verify end to end

**Complexity: 3/10** — three functional-spec edits, two user-documentation pages, and a full manual pass. No code, but every walk rule has to read consistently in each place, and the manual checks must cover the paths the unit tests cannot.

## Goal

Bring the written contract in line with the delivered walk:

- `product/specs/quit-confirmation.md` describes the per-tab walk in place of the retired one-button dialog.
- `product/specs/editor-tab.md` says quitting walks every dirty tab through the same three-button dialog, titled with the tab's name, and points at `quit-confirmation.md`.
- `product/specs/image-tab.md` says image edits are walked like an editor tab and that **Save** replaces the original file.
- `help/quit.md` and `documentation/user-documentation/command-bar/commands.md` replace the "Close anyway" description with a short walk description.

Then run the final end-to-end verification, including the source plan's four manual checks and one docked-tab reveal check.

## Dependencies and ordering

This subplan depends on all of `01` through `08`. Do not start it until the full walk is implemented and the diff-scoped checks pass, because the spec wording must describe the final behavior, not an intermediate checkpoint.

## Design decisions

### `product/specs/quit-confirmation.md`

Keep the existing "Trigger", "`exit` is not `quit`", "Selection and confirming/cancelling", and "Modal behavior" sections for the plain quit dialog. In "Unsaved changes" (currently lines 26–34), replace the one-dialog paragraph with the walk, and keep the paragraph on what counts as unsaved work and the paragraph on the per-tab close prompt. The rewritten section must state, in prose:

- **Trigger:** `quit` / `/quit` at any command bar, and closing the last remaining tab by `close` / `exit` (bare, slashed, or named), the tab strip's ×, Cmd+W / Ctrl+W, or a page-view tab's ×. A tab's process exiting on its own still quits directly. Closing the managed system shell still hides it and raises nothing.
- **What counts:** a tab whose registered `DirtyTabHandle` answers `isDirty()` true. Today that is an editor tab with an unwritten buffer and an image tab with unsaved edits; a tab with nothing registered reads clean.
- **Start:** when a trigger finds at least one dirty tab, the first dirty tab's three-button dialog opens at once. There is no summary step and the one-button "You have unsaved changes. Close anyway?" dialog is retired.
- **Order:** tab strip order, left to right, regardless of the current tab. Each turn asks about the first tab that is still dirty and has not been answered in this walk. A tab that closed or stopped being dirty is passed over; there is no snapshot list.
- **Title:** `Do you want to save changes to <name>?`, where `<name>` is the full name the tab strip shows: the editor's file name, else the tab's title, else its label. The single-tab close dialog keeps "Do you want to save changes to this file?" unchanged.
- **Reveal:** each asked-about tab becomes the current tab before its dialog opens, through `focusTab`. A tab docked in a sidebar is selected in that sidebar instead, the way a desktop-notification click reveals one. A hidden tab cannot be switched to; its title alone names it. A docked tab in a collapsed sidebar is selected but may stay out of sight.
- **Buttons and keys:** the existing `SaveChangesDialog` with Save (y), Don't Save (n), Cancel (Esc), Save selected by default, the same modal trapping, and no new key binding. `y` and `n` act regardless of the selection; arrows move the selection and `Enter` runs it. Each later tab's dialog opens with whichever button was selected when the previous tab was answered.
- **Save semantics:** Save follows the existing `DirtyTabHandle.save()` contract: it resolves only once the work is on disk and rejects on a failed write, a missing buffer, or a save that became an overwrite-conflict question.
- **After the last answer:** once every dirty tab has been answered with Save (and the save succeeded) or Don't Save, the app runs its normal exit sequence with no further "Are you sure you want to quit?" step.
- **Cancel:** Cancel on any tab stops the whole quit and leaves the app open. Files already saved earlier in the walk stay saved. Tabs answered Don't Save keep their edits and stay dirty, because nothing is discarded until the app actually exits. Focus goes into the tab that was being asked about.
- **Failed save:** a rejected save stops the whole quit, dismisses the dialog, leaves the app open, and focuses that tab so its error or overwrite prompt is visible. Earlier answers keep the same effects as Cancel.
- **Later quit:** quitting again after a cancelled or failed walk asks about every tab that is still dirty, including tabs answered Don't Save last time.
- **Tab gone:** if the tab being asked about is gone when a button is pressed, nothing is saved for it and the walk moves to the next dirty tab, or quits if none remain. A tab already gone before its turn is skipped the same way. This applies to every button, including Cancel.
- **No progress and no bulk action:** each dialog shows only its title and the three buttons; there is no "n of total" line. There is no Save All or Don't Save All.
- **No dirty tab:** `quit` and last-tab close behave exactly as today, with the plain "Are you sure you want to quit?" dialog.
- **Browser close:** the browser's own `beforeunload` prompt is unchanged; no in-app dialog can intercept it.
- **Per-tab close:** the prompt shown when closing one tab while others remain is unchanged and remains separate.

Add a sentence to "Modal behavior" that each walk step uses the same `SaveChangesDialog` trapping, so the existing mouse/keyboard rules apply throughout the walk, including between one tab's answer and the next dialog.

### `product/specs/editor-tab.md`

In "Closing with unsaved changes", replace the `quit` paragraph at line 249. It currently says quitting "does not go through this per-tab dialog" and points at `quit-confirmation.md` for a different whole-app prompt. The replacement says that typing `quit`, or closing the last remaining tab, walks every dirty tab through this same three-button dialog, one tab at a time, titled with the tab's full name, and points at `quit-confirmation.md` for the walk's order, reveal, Cancel, and failure rules. Keep the following paragraph about the browser's native prompt. Keep the paragraph at line 251 that says the dialog is shared with other dirty-capable tabs, with **Save** replacing the original image file for an image tab.

### `product/specs/image-tab.md`

In "Unsaved edits", lines 184–192, keep the statement that an image tab gets the same three-button dialog and that **Save** replaces the original file and, on the per-tab close path, only closes after the write. Change the sentence that says unsaved image edits "hold up" `quit` and last-tab close so it says they are walked like an editor tab: quitting asks about the image tab's unsaved edits through the same dialog, titled with the tab's name, and **Save** replaces the original file before the walk advances; the app exits after the last answer. Keep the pointer to `[[quit-confirmation]]` and the browser-page close note. The sentence must still read true for an image tab, which has no editor file name, so its walk title comes from its title or label.

### `help/quit.md`

Replace the last sentence of the page, currently "If any tab has unsaved changes, the dialog reads "You have unsaved changes. Close anyway?" instead, and confirming discards them." with a short walk description. It should say that with unsaved changes the app asks about each dirty tab in tab-strip order, using the same Save / Don't Save / Cancel dialog as closing one tab; Save writes before moving on; Don't Save leaves that tab's edits in place until the app exits; Save is selected first and the selection carries; Cancel or a failed save stops the quit and leaves the app open; and when every dirty tab is answered the app exits. Keep the first part of the paragraph about Cancel being selected by default for the plain quit dialog and focus returning to the command line, and keep the final sentence that a schedule- or tab-sent `quit` exits without asking.

### `documentation/user-documentation/command-bar/commands.md`

In "Quitting with unsaved work", replace the two paragraphs at lines 176 and 178. They currently describe a "Close anyway" dialog with **Close anyway (y)** and **Cancel (n)**, and say confirming discards everything with no per-file prompt. Replace them with the walk: every dirty tab is asked about in tab-strip order, one at a time, with the same three-button dialog as closing a single tab; the title names the tab; the tab is brought on screen (a docked tab is selected in its sidebar); Save writes before the walk moves on; Don't Save moves on and leaves the edits until the app exits; Save is selected first and the selection carries; Cancel or a failed save stops the quit and leaves the app open with that tab focused; there is no Save All; when the last dirty tab is answered the app exits; the next quit starts over with every still-dirty tab. Keep the paragraph defining unsaved work (editor buffer or image edits) and the paragraph about the browser's own prompt.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Quit spec | `product/specs/quit-confirmation.md:26-34` ("Unsaved changes"), `:36-41` ("Modal behavior") | Rewritten around the walk; plain-dialog sections kept. |
| Editor spec | `product/specs/editor-tab.md:231-251` ("Closing with unsaved changes") | The `quit` paragraph changes; the rest stays. |
| Image spec | `product/specs/image-tab.md:179-192` ("Unsaved edits") | The quit/last-tab sentence changes; the save semantics stay. |
| Quit help page | `help/quit.md:21` | One sentence replaced with the walk description. |
| Command-bar user documentation | `documentation/user-documentation/command-bar/commands.md:174-182` ("Quitting with unsaved work") | The two "Close anyway" paragraphs are replaced. |
| Delivered behavior | Subplans `01`–`08`, especially `06-quit-walk-guard` and `08-quit-entry-and-cmd-w` | The source of truth for every claim in the edited text. |

## Proposed changes

- Edit `product/specs/quit-confirmation.md` as described.
- Edit the `quit` paragraph in `product/specs/editor-tab.md`.
- Edit the quit/last-tab sentence in `product/specs/image-tab.md`.
- Edit `help/quit.md`.
- Edit `documentation/user-documentation/command-bar/commands.md`.
- No source, test, config, or plan file changes in this subplan.

## Tests

No new automated tests. The behavior is already covered by the suites from subplans `02` through `08`. The spec edits are checked by reading them against the final code and by searching the repository for the retired wording.

Search for the retired phrases after editing:

- `You have unsaved changes. Close anyway?` must appear nowhere in `help/`, `documentation/user-documentation/`, or `product/specs/`. It will still appear in plan documents that describe the retirement, so scope the search to those three trees.
- `Close anyway (y)` must appear nowhere in `help/`, `documentation/user-documentation/`, or `product/specs/`.
- The new walk wording must use the exact title `Do you want to save changes to <name>?` and the exact button names `Save (y)`, `Don't Save (n)`, and `Cancel (Esc)`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the doc/spec edits. `check-diff` does not validate prose, but it confirms no code or type regression slipped in with the edits.

Then run the source plan's manual checks in the running app:

1. Open three editor tabs and edit the first and third without saving. Type `quit` in the second. The first tab comes on screen behind "Do you want to save changes to <its file name>?". Press `y`; the third tab comes on screen with its own title; press `n`. The app exits, the first file holds its edits on disk, and the third does not.
2. Repeat, then press `Escape` at the third tab's dialog. The app stays open on the third tab with the cursor in its buffer and its edits intact.
3. With one dirty editor tab and nothing else open, press Cmd+W. The walk asks about that one tab. Press Cmd+W again while the dialog is up; nothing changes.
4. With no unsaved work, type `quit`: the plain "Are you sure you want to quit?" dialog appears as before.

Add one docked-tab check, because the walk test fakes `revealDocked` rather than exercising the real sidebar selection:

- Dock a dirty image tab (a plugin tab with unsaved edits) in a sidebar with `tab dock <label> left` and trigger `quit`. Confirm the sidebar selects that tab before its dialog opens, instead of the center pane switching to it. Editor tabs are not dockable, so the image tab is the real docked case. If the sidebar is collapsed, confirm the selection is updated and the title still names the tab.

Finally, read the two edited user-documentation pages in the VitePress preview or rendered markdown and confirm they no longer describe a one-button "Close anyway" dialog and do not promise that confirming discards everything.

## Out of scope

- No source, test, or config change.
- No rewrite of the plain quit dialog's trigger, selection, or modal sections beyond the added walk cross-reference.
- No change to the per-tab close documentation except the `quit` paragraph in `editor-tab.md`.
- No architecture-doc, README, or changelog update.
- No server or protocol change.
- No new automated test that duplicates the walk suites.

The full source-plan out-of-scope list remains in force across this subplan and the delivered feature: no change to the per-tab close dialog when other tabs remain; the browser's own `beforeunload` prompt; which tabs register unsaved work; Save All and Don't Save All shortcuts; a summary dialog ahead of the walk; a progress indicator; the single-tab close dialog's title; a `quit` sent by a schedule or another tab, which still exits without asking; and any server or protocol change.
