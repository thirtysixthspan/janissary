# Update the quit specs and user documentation, then verify end to end

**Complexity: 3/10** — prose-only edits to three functional specs, one help page, and three user-documentation pages, plus a full manual pass. No code, but every walk rule has to read the same in each place, several stale sentences sit outside the obvious "Close anyway" paragraphs, and the manual checks must cover what the unit tests fake.

## Goal

Bring the written contract in line with the delivered walk:

- `product/specs/quit-confirmation.md` describes the per-tab walk in place of the retired one-button dialog.
- `product/specs/editor-tab.md` says quitting walks every dirty tab through the same three-button dialog, titled with the tab's name, and points at `quit-confirmation.md`.
- `product/specs/image-tab.md` says image edits are walked like an editor tab and that **Save** replaces the original file.
- `help/quit.md` and `documentation/user-documentation/command-bar/commands.md` replace the "Close anyway" description with a short walk description.
- `documentation/user-documentation/tab-types/image-viewer.md` and `documentation/user-documentation/getting-started/tabs.md` lose the two sentences that no longer read true once quitting walks dirty tabs (see their sections below).

Then run the final end-to-end verification, including the source plan's four manual checks and one docked-tab reveal check.

## Dependencies and ordering

This subplan depends on all of `01` through `08` and on the fix plan `quit-walk-gone-tab-title-test.md`. All of them are implemented on `feature/quit-unsaved-work-walk` (their plans are in `product/plans/complete/`), so it can start now. The walk is reachable from every quit entry point and `UnsavedQuitDialog` is deleted, so the text below describes the final behavior.

The edits are independent of each other and can land in any order. Make them in one commit so no checkpoint has one page describing the walk and another still describing "Close anyway".

## Wording rules for this subplan

- **Specs state user-visible behavior only.** Every sentence added to `product/specs/` describes what a user sees and does: dialog text, buttons, keys, which tab is shown, where focus lands, what is on disk afterwards. Do not write component, hook, ref, RPC, or type names (`SaveChangesDialog`, `DirtyTabHandle`, `isDirty()`, `focusTab`, `revealDocked`, `saveWalkOpenRef`, …) or source file paths into the new spec text. This is the convention in `ai/tasks/feature/build-a-feature.md` step 3 ("prose describing user-visible behavior only — no code, no implementation details, no file paths"). The code anchors in this plan exist so the implementer can check each claim; they are not spec wording. Existing spec text that already names an implementation detail (the "window-level *capture*-phase listener" in "Modal behavior") is left as it is.
- **User documentation and help pages** follow `ai/guidelines/user-documentation.md`: no implementation names at all, and the reader has never seen the spec.
- **Exact strings.** Quote these verbatim wherever they appear: the walk title `Do you want to save changes to <name>?` (no quotes around the name, `<name>` as the placeholder in specs), the single-tab title "Do you want to save changes to this file?", the plain title "Are you sure you want to quit?", and the button names **Save (y)**, **Don't Save (n)**, **Cancel (Esc)**. The rendered buttons are in `web/src/unsaved-work/SaveChangesDialog.tsx` (`Save (y)`, `Don&#39;t Save (n)`, `Cancel (Esc)`) and the title builder is `walkTitle` in `web/src/unsaved-work/save-walk.ts`.
- **Help and user-doc pages describe the walk briefly.** The full rule list lives in `quit-confirmation.md` only; the other pages state the rules a user needs and link or point there.

## Design decisions

### `product/specs/quit-confirmation.md`

Keep the existing "`exit` is not `quit`" and "Selection and confirming/cancelling" sections for the plain quit dialog unchanged.

**"Trigger"** (line 7, "The application only exits once the dialog is confirmed."): add one sentence at the end of that first paragraph saying that when any tab holds unsaved work, the per-tab walk described under "Unsaved changes" runs in place of this dialog. Change nothing else in "Trigger".

**"Unsaved changes"** (lines 26–34). Make these four edits:

1. Replace the first paragraph (line 28, starting "If any open tab has unsaved changes when `quit` runs") with the walk rules listed below.
2. Keep the paragraph defining unsaved work (line 30, starting `"Unsaved changes" here means`) but replace its last sentence, "Both raise this dialog, and confirming discards both.", with one saying both kinds of tab are asked about in the walk. "Confirming discards" is no longer true.
3. Keep line 32 ("When no tab has unsaved changes, `quit` and last-tab-close behave exactly as described above.").
4. Reword line 34 ("This is separate from — and does not replace — the per-tab unsaved-changes prompt…"). It must now say that closing one tab while others remain still shows its own unchanged per-tab prompt (titled "Do you want to save changes to this file?", closing the tab after the answer, see `editor-tab.md`). The walk uses the same dialog with a different title and never closes a tab.

The walk rules, each stated as user-visible behavior:

- **Trigger:** `quit` / `/quit` typed at any command bar. Also closing the last remaining tab by `close` / `exit` (bare, slashed, or named), the tab strip's ×, Cmd+W / Ctrl+W, or a page-view tab's ×. A tab's process exiting on its own still quits directly. Closing the managed system shell still hides it and raises nothing. A `quit` sent by a schedule or another tab still exits without asking. Grounding: every path reaches `guardedOpenQuitConfirm` in `web/src/unsaved-work/useUnsavedQuitGuard.ts`; `App.tsx` `closeTab` calls it first (`if (closeQuitsApp(tabs, index)) { guardedOpenQuitConfirm(); return; }`).
- **Start:** when a trigger finds at least one tab with unsaved work, the first such tab's three-button dialog opens at once. There is no summary step, and the one-button "You have unsaved changes. Close anyway?" dialog no longer exists.
- **Order:** the overall tab order, the same left-to-right order the tab strip shows, whichever tab is current. A tab in the other half of a split center or docked in a sidebar is asked about at its place in that overall order. This is the server's full tab list order, which `nextWalkLabel` in `save-walk.ts` walks. Each turn asks about the first tab that still has unsaved work and has not been answered in this walk. A tab that closed or no longer has unsaved work is passed over.
- **Title:** `Do you want to save changes to <name>?`, where `<name>` is the name the tab strip shows for that tab: an editor tab's file name, otherwise the tab's title, otherwise its label. An image tab has no editor file name, so its title or label is used. If the tab disappears while its dialog is open, the title switches to the tab's label. Grounding: `tabFullName` in `web/src/shared/tab/tab-name.ts`, and the fallback `walkTitle(quitTab ? tabFullName(quitTab) : request.label)` in `useQuitWalk.ts`. The single-tab close dialog keeps "Do you want to save changes to this file?" unchanged.
- **Reveal:** each asked-about tab is brought on screen behind its dialog. A tab docked in a sidebar is shown in that sidebar instead, and the center pane does not switch; this works the way clicking a desktop notification for a docked tab does. A hidden tab is not brought on screen, and the dialog title alone names it. There is no collapsed-sidebar state in the app (`product/specs/sidebars.md`, "Visibility is derived"), so the spec says nothing about one.
- **Buttons and keys:** the same three buttons as the single-tab close dialog, **Save (y)**, **Don't Save (n)**, **Cancel (Esc)**, with **Save** selected when the walk starts. `←` / `→` move the selection and `Enter` runs the selected button. `y` and `n` act regardless of the selection and do not move it. Each later tab's dialog opens with the selection where it was when the previous tab was answered. For example, pressing `n` while **Save** is selected leaves **Save** selected on the next tab. No new key binding is added.
- **Save:** writes that tab's work. For an editor tab that means its file; for an image tab it replaces the original image file. The walk moves on only after the write succeeds.
- **While a save is running:** **Save** is disabled, and repeated `y`, `Enter` on Save, or clicks on it do nothing. **Don't Save** and **Cancel** stay available. **Don't Save** moves on to the next tab and **Cancel** stops the quit. After either, a write already started may still finish, but its success or failure no longer advances the walk, stops a quit, or moves focus. Grounding: the generation check in `useSaveConfirm.ts` (`isCurrentAttempt`).
- **Don't Save:** moves on to the next tab without saving. Nothing is closed or discarded yet, and the tab keeps its edits until the app exits.
- **After the last answer:** once every tab with unsaved work has been answered with a successful Save or with Don't Save, the app runs its normal exit sequence (the same one the plain dialog's Confirm runs). There is no further "Are you sure you want to quit?" step.
- **Cancel:** stops the whole quit, and the app stays open. Files saved earlier in the walk stay saved. Tabs answered Don't Save keep their edits and still count as unsaved. Focus goes into the tab that was being asked about (an editor tab at its cursor).
- **Failed save:** the server reports an error, or the file changed on disk and the overwrite prompt goes up instead. Either way the whole quit stops: the dialog is dismissed, the app stays open, and focus goes into that tab so its error or overwrite prompt is visible. Earlier answers keep the same effects as under Cancel.
- **Later quit:** quitting again after a cancelled or failed walk starts over and asks about every tab that still has unsaved work, including tabs answered Don't Save last time.
- **Tab gone:** if the tab being asked about is gone when any button is pressed, Cancel included, nothing is saved for it. The walk moves on to the next tab with unsaved work, or quits if none remain. A tab that is gone before its turn is skipped the same way. Grounding: `save` and `cancel` in `useQuitWalk.ts` call `advance()` when `!isPresent(label) || !handle`.
- **No progress and no bulk action:** each dialog shows only its title and the three buttons, with no "n of total" line. There is no Save All or Don't Save All.
- **Browser close:** closing or reloading the browser page still shows only the browser's own "leave site?" prompt; no in-app dialog can intercept it.

**"Modal behavior"** (lines 36–41): add one sentence after the first paragraph saying the same trapping applies to every dialog in the walk, without a gap between one tab's answer and the next tab's dialog. It must also say that Cmd+W / Ctrl+W does nothing for the whole walk, including while a save is running. Grounding: `useCmdWRefs.ts`'s `quitConfirmOpenRef` reads `saveWalkOpenRef` live. Leave the two bullets unchanged.

### `product/specs/editor-tab.md`

In "Closing with unsaved changes", replace the first sentence of the paragraph at line 249 ("Typing `quit`, or closing the last remaining tab, does not go through this per-tab dialog — see `quit-confirmation.md` for the whole-app unsaved-changes prompt shown in that case."). The new sentence says that typing `quit`, or closing the last remaining tab, asks about every tab with unsaved changes through this same three-button dialog, one tab at a time. Each dialog is titled `Do you want to save changes to <name>?` with the tab's name, and Save there writes the file without closing the tab. It points at `quit-confirmation.md` for the walk's order, reveal, Cancel, and failure rules. Keep that paragraph's second sentence about the browser's native "leave site?" prompt. Keep the paragraph at line 251 ("This dialog is not the editor tab's alone…") unchanged.

### `product/specs/image-tab.md`

In "Unsaved edits" (the paragraph at lines 184–192), keep everything up to and including "…typed at another tab's command line —". Replace the closing clause "and unsaved image edits also hold up `quit`, closing the last tab, and closing or reloading the browser page (see [[quit-confirmation]])." The new clause says that `quit` and closing the last tab ask about the image tab's unsaved edits through the same dialog, one tab at a time, titled with the tab's title or label (an image tab has no file name of its own in the strip). **Save** there replaces the original file before the walk moves on, and the app exits after the last answer. Closing or reloading the browser page shows the browser's own prompt. Keep the `[[quit-confirmation]]` pointer.

### `help/quit.md`

- In "Use cases", change the second bullet "Confirm and exit when unsaved work is present." to one saying you can save or discard each tab's unsaved work, then exit.
- Replace the paragraph's sentence on line 21, "If any tab has unsaved changes, the dialog reads "You have unsaved changes. Close anyway?" instead, and confirming discards them.", with a short walk description. It says that with unsaved changes, the app asks about each such tab in tab-strip order with the same Save / Don't Save / Cancel dialog as closing one tab, naming the tab. Save writes before moving on, and Don't Save leaves that tab's edits until the app exits. Save is selected first and the selection carries to the next tab. Cancel or a failed save stops the quit and leaves the app open. When every such tab is answered, the app exits.
- Keep the rest of line 21 unchanged: the opening sentences about asking first, Cancel selected by default, and the cursor returning to the command line (these describe the plain dialog), and the final sentence that a schedule- or tab-sent `quit` exits without asking.
- Keep the `### quit` heading exactly: `src/commands.test.ts` asserts `outputText('help /quit')` contains `### quit`.

### `documentation/user-documentation/command-bar/commands.md`

- In "`quit` and the confirmation dialog", add one sentence to the end of the first paragraph (line 168, ending "clicks outside it and other keys do nothing."). It says that when a tab holds unsaved work, `quit` asks about that work instead, with a link to `#quitting-with-unsaved-work`. Leave the rest of the section unchanged.
- In "Quitting with unsaved work", replace the two paragraphs at lines 176 and 178 with the walk. Every tab with unsaved work is asked about in tab-strip order, one at a time, with the same Save / Don't Save / Cancel dialog as closing a single tab. The title names the tab, and the tab is brought on screen (a docked tab is shown in its sidebar). Save writes before the walk moves on. Don't Save moves on and leaves the edits until the app exits. Save is selected first and the selection carries. Cancel or a failed save stops the quit and leaves the app open with that tab focused. There is no Save All. When the last such tab is answered the app exits, and the next quit starts over with every tab that still has unsaved work.
- In the paragraph at line 180 (starting "Unsaved work means"), keep the first sentence. Replace "Both raise this dialog. This is a different thing from the save prompt you get when closing one tab while others remain — that one offers to save the file first." with sentences saying both are asked about, and that closing one tab while others remain shows the same dialog for that tab alone and closes the tab afterwards. The walk now offers to save too, so "a different thing… offers to save first" is false.
- Keep the paragraph at line 182 about the browser's own prompt.

### `documentation/user-documentation/tab-types/image-viewer.md`

In the paragraph at line 69, replace the clause "and they hold up `quit` and a browser reload too." It should say instead that quitting asks about them the same way, one tab at a time, with **Save** replacing the original file. Link it to `/user-documentation/command-bar/commands#quitting-with-unsaved-work`, the same link style `getting-started/startup.md:141` uses for `#quit-and-the-confirmation-dialog`. A browser reload gets the browser's own prompt. Keep the rest of the paragraph.

### `documentation/user-documentation/getting-started/tabs.md`

In the paragraph at line 152 (starting "Closing the **last** remaining tab quits the app"), add a clause after "…exactly as if you'd typed `quit`." saying that with unsaved work, that means the save walk. Link it to `/user-documentation/command-bar/commands#quitting-with-unsaved-work`. Then narrow "If you cancel the dialog, the tab stays open and the cursor returns to the command line." to the plain quit dialog, because cancelling the walk puts focus in the asked-about tab instead. Leave the rest of the paragraph unchanged.

### Pages checked and left unchanged

These pages mention quitting, the save dialog, or unsaved work. Each still reads true, so leave it alone:

- `product/specs/tabs.md` "`close` command": says a last-tab close "behaves exactly like `quit`" and defers to `quit-confirmation.md`.
- `product/specs/application-commands.md` "`quit`": "Requires confirmation first — see `quit-confirmation.md`."
- `product/specs/keyboard-navigation.md:15`: Cmd+W is a no-op "while any modal dialog is open, such as the save-changes prompt".
- `product/specs/tab-plugins.md:13`: the host "decides when to ask, draws its own save-changes dialog".
- `product/specs/sidebars.md:45`, `product/specs/shell-tab.md:85-87`, and the "closing the last remaining tab quits the app" lines in `pdf-tab.md`, `markdown-tab.md`, `embedded-web-page.md`, `file-navigator-tab.md`, and `ssh-tab.md`.
- `help/commands.md:43` ("Exit the application (asks for confirmation)").
- `documentation/user-documentation/tab-types/editor.md` "Closing with unsaved changes" (per-tab close only; it does not mention quit) and line 226 ("save before quitting").
- `documentation/user-documentation/getting-started/keyboard.md:91`, `getting-started/startup.md:141`, `tab-types/markdown-preview.md:35`, and `command-bar/shell.md:23`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Quit spec | `product/specs/quit-confirmation.md` "Trigger" (line 7), "Unsaved changes" (lines 26–34), "Modal behavior" (lines 36–41) | One sentence added to Trigger; Unsaved changes rewritten around the walk; one sentence added to Modal behavior. |
| Editor spec | `product/specs/editor-tab.md` "Closing with unsaved changes" (lines 231–251) | The first sentence of the line 249 paragraph changes; the rest stays. |
| Image spec | `product/specs/image-tab.md` "Unsaved edits" (lines 179–192) | The closing quit clause changes; the save semantics stay. |
| Quit help page | `help/quit.md:14`, `:21` | One use-case bullet and one sentence replaced. |
| Command-bar user documentation | `documentation/user-documentation/command-bar/commands.md:168`, `:174-182` | One pointer sentence; the two "Close anyway" paragraphs and the "different thing" sentences replaced. |
| Image and tabs user documentation | `tab-types/image-viewer.md:69`, `getting-started/tabs.md:152` | One clause each. |
| Walk order and title | `nextWalkLabel`, `walkTitle` in `web/src/unsaved-work/save-walk.ts`; `tabFullName` in `web/src/shared/tab/tab-name.ts` | Ground the Order and Title rules. |
| Walk buttons, skip, failure, Cancel | `web/src/unsaved-work/useQuitWalk.ts` (`start`, `save`, `discard`, `cancel`, `advance`) | Ground the Save, Don't Save, Cancel, Failed save, Tab gone, and After the last answer rules. |
| Selection carry and pending save | `web/src/unsaved-work/useSaveConfirm.ts` (`advanceQuitWalk` keeps `previous.selection`; `isCurrentAttempt`) and `SaveChangesDialog.tsx` (`y`/`n` do not call `choose`) | Ground the Buttons and keys and While a save is running rules. |
| Reveal | `App.tsx` `revealDocked` (`sidebarSelectionFor(client).select(label)`), `useQuitWalk.ts` `reveal` (`focusTab` only when no sidebar took the label), `src/tab/navigation-commands.ts:25` (`if (tabs[index]?.dock \|\| tabs[index]?.hidden) return;`) | Ground the Reveal rule, including the hidden-tab case. |
| Focus and Cmd+W during the walk | `web/src/useFocusOnTabSwitch.ts` (`suppressRef`), `web/src/useCmdWRefs.ts` (`quitConfirmOpenRef` getter) | Ground the Modal behavior sentence. |

## Proposed changes

- Edit `product/specs/quit-confirmation.md` as described.
- Edit the line 249 paragraph in `product/specs/editor-tab.md`.
- Edit the closing quit clause in `product/specs/image-tab.md`.
- Edit `help/quit.md`.
- Edit `documentation/user-documentation/command-bar/commands.md`.
- Edit one clause each in `documentation/user-documentation/tab-types/image-viewer.md` and `documentation/user-documentation/getting-started/tabs.md`.
- No source, test, config, or other plan file changes in this subplan.

## Tests

No automated test changes. Subplans `02` through `08` already cover the behavior. No test reads the body text of `help/quit.md`, any `product/specs/` file, or the edited user-documentation pages. `src/commands.test.ts` only asserts `help /quit` output contains `### quit`, and `src/help-pages.test.ts` uses its own temporary `quit.md` fixture. No docs screenshot in `scripts/docs-screenshots/manifest.mjs` shows a quit or save dialog.

Check the edits by reading them against the code anchors above and by searching for the retired wording:

- `grep -rn "Close anyway" help documentation/user-documentation product/specs` returns nothing. Plan documents that describe the retirement still match, which is why the search is scoped to those three trees.
- `grep -rniE "confirming discards|hold up .quit|different thing from the save prompt" help documentation/user-documentation product/specs` returns nothing.
- The new walk wording uses the exact title `Do you want to save changes to <name>?` in the specs, and the exact button names `Save (y)`, `Don't Save (n)`, `Cancel (Esc)` wherever buttons are named with their keys.
- `grep -nE "SaveChangesDialog|DirtyTabHandle|isDirty|focusTab|revealDocked|saveWalkOpenRef|useQuitWalk" product/specs/quit-confirmation.md product/specs/editor-tab.md product/specs/image-tab.md` returns nothing (the spec wording rule).

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the edits. It lints nothing here, because no lintable file changed. Because `help/quit.md` changed, it does run `src/commands.test.ts` (`test:help`), which must stay green.

Then run the source plan's manual checks in the running app (start it per `ai/tasks/workspace/start-application.md`, resolved as described in `AGENTS.md`). Use scratch files, not files you care about, because Save writes to disk:

1. Open three editor tabs and edit the first and third without saving. Type `quit` in the second. The first tab comes on screen behind "Do you want to save changes to <its file name>?". Press `y`; the third tab comes on screen with its own title; press `n`. The app exits, the first file holds its edits on disk, and the third does not.
2. Repeat, then press `Escape` at the third tab's dialog. The app stays open on the third tab with the cursor in its buffer and its edits intact.
3. With one dirty editor tab and nothing else open, press Cmd+W. The walk asks about that one tab. Press Cmd+W again while the dialog is up; nothing changes.
4. With no unsaved work, type `quit`: the plain "Are you sure you want to quit?" dialog appears as before.

Add one docked-tab check, because the walk test fakes `revealDocked` rather than exercising the real sidebar selection. Editor tabs are not dockable, so an image tab is the real docked case:

5. Copy an image to a scratch path and `open` it. Click **Edit image**, rotate it, and click **Done**, so the tab is marked unsaved. Dock a second, different kind of tab on the same side with `notifications left`, then dock the image tab with `tab dock image left` (use the image tab's label if it is not `image`). Leave a center tab open, because the app refuses to dock the only visible center tab. Click the notifications entry in the sidebar so it is the one shown. Then type `quit` in the center tab. The sidebar switches to the image tab before its dialog appears, the center pane does not switch, and the title reads "Do you want to save changes to <the image tab's title or label>?". Press `Escape`; the app stays open and the image tab still shows as unsaved.

Finally, read the edited user-documentation pages in the VitePress preview (`npm run docs:dev`) or as rendered markdown. Confirm none still describes a one-button "Close anyway" dialog or promises that confirming discards everything, and that the two new `#quitting-with-unsaved-work` links land on that heading.

## Out of scope

- No source, test, or config change.
- No rewrite of the plain quit dialog's "Trigger", "`exit` is not `quit`", "Selection and confirming/cancelling", or "Modal behavior" text beyond the one sentence each added to "Trigger" and "Modal behavior".
- No change to the per-tab close documentation except the line 249 paragraph in `editor-tab.md` and the "different thing" sentences in `commands.md`.
- No edit to the pages listed under "Pages checked and left unchanged".
- No architecture-doc, README, or changelog update.
- No server or protocol change.
- No new automated test that duplicates the walk suites.

The full source-plan out-of-scope list remains in force across this subplan and the delivered feature: no change to the per-tab close dialog when other tabs remain; the browser's own `beforeunload` prompt; which tabs register unsaved work; Save All and Don't Save All shortcuts; a summary dialog ahead of the walk; a progress indicator; the single-tab close dialog's title; a `quit` sent by a schedule or another tab, which still exits without asking; and any server or protocol change.
