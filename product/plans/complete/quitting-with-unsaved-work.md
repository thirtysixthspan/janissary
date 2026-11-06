# Quitting with unsaved work

**Complexity: 5/10** — client-only, no protocol change, but generalizes the single-tab close guard into a two-mode request state machine with stale-save protection across steps. It moves five files into a new feature directory with a lint-zone update, and has to catch two focus/keyboard interactions (Cmd+W and tab-switch focus) that only show up because the walk switches tabs under a modal.

When any tab holds unsaved work, `quit` (or closing the last tab) opens one dialog, "You have unsaved changes. Close anyway?", and confirming discards everything unsaved; there is no per-file save prompt (`product/specs/quit-confirmation.md`). Closing a single dirty tab already offers Save, Don't Save, and Cancel (`product/specs/editor-tab.md`), so the per-file choice exists right up until the app itself closes. A wrong click on the quit dialog loses work. This feature walks the dirty tabs through that same three-button dialog one after another before the quit proceeds, using the registry of unsaved work the app already keeps, the way VS Code's close-window prompt asks about each dirty file.

## Design decisions

- **Trigger paths** are the ones that reach the whole-app unsaved-changes dialog today: `quit` / `/quit` at any command bar, and closing the last remaining tab by `close` / `exit` (bare, slashed, or named), the tab strip's ×, Cmd+W / Ctrl+W, or a page-view tab's ×. A tab's process exiting on its own still quits directly without any dialog. Closing the managed system shell still hides it and raises nothing.
- **Which tabs count as unsaved** is decided by the existing registry: a tab whose registered `DirtyTabHandle` answers `isDirty()` true. Today that is an editor tab with an unwritten buffer and an image tab with unsaved edits. A tab with nothing registered reads clean.
- **The per-file dialog** is the existing `SaveChangesDialog` with its three buttons, Save (y), Don't Save (n), Cancel (Esc), Save selected by default, and the same modal trapping.
- **Save semantics** follow the existing `DirtyTabHandle.save()` contract: it resolves only once the work is on disk and rejects on a failed write, a missing buffer, or a save that became an overwrite-conflict question.
- **The walk starts directly.** When a trigger path finds at least one dirty tab, the first dirty tab's three-button dialog opens at once. The one-button "You have unsaved changes. Close anyway?" dialog is retired; no summary step comes first.
- **The app quits right after the last answer.** Once every dirty tab has been answered with Save (and the save succeeded) or Don't Save, the app runs its normal exit sequence with no further "Are you sure you want to quit?" step.
- **Cancel stops the whole quit.** Cancel (Esc) on any tab's dialog ends the walk and the app stays open. Files already saved earlier in the walk stay saved. Tabs answered Don't Save keep their edits and stay dirty, since nothing is discarded until the app actually exits.
- **A failed save stops the whole quit.** When a save rejects — the server reports an error, or the file changed on disk and the overwrite prompt goes up instead — the walk ends, the app stays open, the dialog is dismissed, and that tab gets focus so its error or overwrite prompt is visible, the same as the per-tab close. Earlier answers keep the effects described under Cancel.
- **A later quit starts over.** Quitting again after a cancelled or failed walk asks about every tab that is still dirty, including tabs answered Don't Save last time.
- **Walk order is tab strip order**, left to right, regardless of which tab is current. Each turn asks about the first tab in the strip that is still dirty and has not been answered in this walk, so a tab that closed or stopped being dirty is passed over.
- **The walk's title names the tab**: `Do you want to save changes to <name>?`, where `<name>` is the full name the tab strip shows for that tab (the editor's file name, else the tab's title, else its label). The single-tab close dialog keeps "Do you want to save changes to this file?" unchanged.
- **Each asked-about tab is brought on screen.** The walk makes it the current tab before its dialog opens. A tab docked in a sidebar is selected in that sidebar instead, the way clicking a desktop notification reveals one.
- **No progress indicator.** Each dialog in the walk shows only its title and the three buttons; there is no "n of total" line.
- **A tab that disappears is skipped.** If the tab being asked about is gone when a button is pressed (an agent or schedule closed it), nothing is saved for it and the walk moves on to the next dirty tab, or quits if none remain. A tab already gone before its turn is skipped the same way.
- **One tab at a time.** The walk offers exactly the existing three buttons per tab; there is no Save All or Don't Save All.
- **One guard for close and quit.** `CloseSaveGuard` is generalized to drive both the single-tab close (one tab, then close it) and the quit walk (every dirty tab, then quit), rather than adding a second guard beside it.
- **One feature directory.** The guard, the quit guard hook, the save dialog, the dirty-tab check, and the new walk module live together in `web/src/unsaved-work/`. Nothing goes to `shared/` except the tab-name helper, which gains a second consumer.
- **When no tab is dirty**, `quit` and last-tab close behave exactly as today: the plain "Are you sure you want to quit?" dialog.
- **Closing the browser window** itself keeps the native `beforeunload` prompt; no in-app dialog can intercept that path.
- **The per-tab close dialog** shown when closing one tab while others remain is unchanged.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Dirty-tab registry | `web/src/App.tsx` (`tabHandles`, a `Map<string, DirtyTabHandle>` keyed by label) and `web/src/dirtyTabs.ts` (`anyDirtyTab`) | Source of the tabs to walk |
| Dirty-tab contract | `web/src/shared/tab/handles.ts` (`DirtyTabHandle`: `isDirty`, `save`, `focus`) | Ask, save, and focus each tab |
| Whole-app quit guard | `web/src/useUnsavedQuitGuard.ts` (`guardedOpenQuitConfirm`, `beforeunload`) | The entry point the walk replaces the single dialog in |
| Three-button dialog | `web/src/SaveChangesDialog/SaveChangesDialog.tsx` and `useSaveConfirm.ts` (label-keyed target, save generation, pending guard) | The per-tab prompt and its stale-attempt protection |
| Per-tab close guard | `web/src/CloseSaveGuard.tsx` | Precedent for save-then-act, failure dismisses and focuses the tab, label-not-index targeting |
| Current one-button dialog | `web/src/UnsavedQuitDialog.tsx` | Replaced or retired by this feature |
| Quit execution | `web/src/QuitDialog/useQuitConfirm.ts` → `runCommand('quit')`; `src/commands/quit.ts` | Final step once every dirty tab is answered |
| Tab focus RPC | `focusTab` with a label (`src/protocol/core-rpc.ts`) | Bringing a tab on screen by label |
| Tab full name | `web/src/TabItem.tsx` (`tab.editor?.name ?? tab.title ?? tab.label`, computed inline) | The name in the walk's title |
| Docked-tab reveal | `web/src/sidebar-selection-coordinator.ts` (`sidebarSelectionFor(client).select`), used the same way by `web/src/notifications/native-notifications.ts` | Showing a docked dirty tab in its sidebar |
| Cmd+W suppression while a quit dialog is open | `web/src/useCmdWRefs.ts` (`quitConfirmOpenRef`), read by `web/src/useCmdW.ts` | Keep Cmd+W inert during the walk |

## Proposed changes

The work is client-only. No protocol message, server module, or command changes: the walk uses `focusTab`, `closeTab`, and the existing `quit` command.

**New feature directory `web/src/unsaved-work/`.** Everything about saving before a close or a quit moves here, so it lives together and nothing about it goes to `shared/`:
- `web/src/CloseSaveGuard.tsx` → `web/src/unsaved-work/CloseSaveGuard.tsx`, generalized as below, with its two tests (`CloseSaveGuard.test.tsx`, `CloseSaveGuard.named-close.test.tsx`).
- `web/src/useUnsavedQuitGuard.ts` → `web/src/unsaved-work/useUnsavedQuitGuard.ts`, slimmed as below, with its test.
- `web/src/SaveChangesDialog/` (the dialog, `useSaveConfirm`, and the dialog test) → `web/src/unsaved-work/`.
- `web/src/dirtyTabs.ts` → `web/src/unsaved-work/dirtyTabs.ts`, with its test.
- `web/src/UnsavedQuitDialog.tsx` and its test are deleted.
- Imports in `web/src/App.tsx` and `web/src/AppMain.tsx` follow the moves. Every other importer of the moved files is itself moving (grep `from '.*(dirtyTabs|useUnsavedQuitGuard|SaveChangesDialog|useSaveConfirm|CloseSaveGuard|UnsavedQuitDialog)'` to confirm).
- `eslint.client-feature-zones.mjs`: in `clientFeatureDirectories`, replace `'SaveChangesDialog'` with `'unsaved-work'`. The cross-feature and feature-to-root zones are generated from that list, so without this the new directory is unguarded and the old entry names a directory that no longer exists. The moved files import only `@shared/protocol` and `web/src/shared/` modules (`shared/ws/ws`, `shared/tab/handles`, `shared/ModalDialog`, `shared/useDialogKeyboard`), which those zones allow.

Land the moves as their own first step, with no behaviour change, and run `check-diff` before starting the walk; every later step then edits files in their final location.

**Tab full name.** Add `tabFullName(tab: TabView): string` to a new `web/src/shared/tab/tab-name.ts`, returning the editor's file name, else the tab's title, else its label. `TabItem` uses it in place of its inline expression (`web/src/TabItem.tsx:47`, `const fullName = tab.editor?.name ?? tab.title ?? tab.label;`), and the walk uses it for the title. It moves to shared because the walk is its second consumer.

**Pure walk module `web/src/unsaved-work/save-walk.ts`.** No React. It owns every decision the walk makes:
- `nextWalkLabel(tabs, isDirty, answered)` returns the label of the first tab in the current tab list (the tab strip's order) that is dirty and not in the `answered` set, or undefined when none remains. `isDirty` is a label → boolean lookup, so the module never sees a handle map. One function covers starting (empty set), advancing, and skipping: a tab that closed is no longer in `tabs`, and a tab that stopped being dirty fails `isDirty`. No snapshot list is kept. Nothing can become dirty while the modal is up, so walking the current list visits the same tabs a snapshot would. If a future tab kind could gain unsaved work under a modal, it would be asked about too, which is the safe direction.
- `walkTitle(name)` returns `Do you want to save changes to <name>?`.

**`SaveChangesDialog` gains two optional props**, with defaults that leave the single-tab dialog exactly as it is:
- `title`, defaulting to "Do you want to save changes to this file?".
- A controlled selection, `selected` and `onSelect`. When absent, the dialog keeps its own selection starting at Save, as today. When present, the arrow keys report the new selection through `onSelect`, and `Enter` runs the `selected` button.
- An optional `className` passed through to `ModalDialog`. The walk passes one that caps the dialog's width and lets the title wrap and break inside long words. Add that class to `web/src/theme.css` next to `.modal-title`.

**`useSaveConfirm` becomes the guard's request state.** Today it holds one label, a generation, and a pending flag. It now holds a request that is either a close of one label or a quit walk (the set of labels answered so far, the label being asked about, and the carried selection). It keeps the one generation counter and pending flag for both kinds. Opening a request, moving the walk to its next label, and dismissing each bump the generation, so a save that settles after Cancel, after the walk moved on, or after unmount can't act. That is the same protection the single-tab dialog has today. `labelRef` keeps meaning "the label being asked about" for both kinds, so the close handlers read it unchanged.

**`CloseSaveGuard` serves both requests.** It keeps publishing the single-tab check through `guardRef` (unchanged contract: `(index) => boolean`), and also publishes `startQuitWalk(): boolean` through a second ref, `quitWalkRef`. `startQuitWalk` asks `nextWalkLabel` with an empty answered set, returns false when it gives nothing, and otherwise opens the walk on that label. The guard also keeps a `saveWalkOpenRef` boolean up to date, true while a walk is running, for the Cmd+W check below. Per button, for the label being asked about:
- **Close request.** Exactly today's behaviour: Save closes after a resolved save, Don't Save closes, Cancel and a rejected save dismiss and focus the tab. No tab switch.
- **Walk, Save.** Await the handle's save. On resolve, if the attempt is still current, advance. On reject, if still current, dismiss the walk and call the tab's `focus()`.
- **Walk, Don't Save.** Advance without saving or closing anything. If a save for this tab is still running (Don't Save stays available while Save is pending), its later result is ignored because the generation moved on; a write already started may still finish, as in the single-tab dialog.
- **Walk, Cancel.** Dismiss the walk and call the tab's `focus()`.
- **Walk, tab gone.** If the label has no handle or is no longer in `tabs` when a button is pressed, advance without saving.
- **Advance.** Add the asked-about label to the answered set and ask `nextWalkLabel` for the next label. If there is one, reveal it (see below), then open its dialog with the carried selection, keyed by label so the dialog remounts and takes focus again. If there is none, dismiss and call `onQuit`.

The walk's four button handlers and the advance step live in a new hook, `web/src/unsaved-work/useQuitWalk.ts`, which `CloseSaveGuard` calls. That way the guard stays a thin component choosing which handler set and title to pass to the dialog (it is 67 effective lines today). The close-request handlers stay where they are in the guard.

In walk mode the guard renders `SaveChangesDialog` with `walkTitle(tabFullName(tab))`, the controlled selection, and the width-capping class. On the first tab it also reveals the tab before opening, so every asked-about tab comes on screen.

**Revealing a tab, docked or not.** The server's `focusTab` (`src/controller/tab-adapter.ts`, `focusTab: (label) => managers.tab.setActiveTab(...)`) ignores a docked or hidden tab (`src/tab/navigation-commands.ts`, `if (tabs[index]?.dock || tabs[index]?.hidden) return;`). So the walk reveals each tab the way a desktop-notification click does (`web/src/notifications/native-notifications.ts:46`, `if (!placement.reveal(event.tab)) this.client.send({ method: 'focusTab', ... })`). It first offers the label to the sidebar selection, and sends `focusTab` only when no sidebar took it. The sidebar selection is `sidebarSelectionFor(client).select` from `web/src/sidebar-selection-coordinator.ts`, an app-shell module the feature directory may not import. `App.tsx` therefore passes that function down to `CloseSaveGuard` as a `revealDocked: (label: string) => boolean` prop, the same way it hands `sidebarSelectionFor(client)` to `useNativeNotifications` today (`web/src/App.tsx:65`). The prop's type is declared inline in the guard, so nothing is imported across the boundary. `select` returns true only for a label that sidebar holds, and makes it that sidebar's shown entry, which is view-local client state. A docked tab in a sidebar that is collapsed is selected but stays out of sight; the dialog title still names it. A hidden tab is neither docked nor switchable, so nothing changes on screen for it and the title alone names it.

The selection starts at Save when a walk opens and carries over between its tabs. The guard takes new props `onQuit`, `revealDocked`, and the refs above, and already has `client` for `focusTab` and `closeTab`.

**The tab switch must not steal the dialog's focus.** `useFocusOnTabSwitch` (`web/src/useFocusOnTabSwitch.ts`) runs whenever `activeTab` changes and focuses the new tab's terminal or command line. Each walk step's dialog mounts (taking focus) before the server's switch arrives, so without a check that hook would move focus off the dialog on every step. Give the hook a `suppressRef` parameter and return early while it reads true. `App.tsx` passes `saveWalkOpenRef`. The key trap keeps working either way, since it listens on the window; this keeps focus where the UI design says it goes. On Cancel or a failed save the walk sets `saveWalkOpenRef` false before calling the tab's `focus()`. Deliberate corner: if `Escape` lands before the server's switch to that tab arrives (a window of one round trip), the late switch runs the hook unsuppressed and focus ends in the command line rather than the tab. The tab is still the current one and its edits are intact. If that shows up in practice, the fix is to keep the suppression up until the next `activeTab` change after a Cancel.

**Every quit entry point already funnels through one function.** `guardedOpenQuitConfirm` is what `App.tsx`'s `closeTab` calls when `closeQuitsApp` is true (`if (closeQuitsApp(tabs, index)) { guardedOpenQuitConfirm(); return; }`), and what `useAppCommandLine` receives as `openQuitConfirm` for typed `quit` and a typed close of the last tab (`classify-submit.ts` returns `confirm-quit` for both). The tab strip ×, Cmd+W, page-view and plugin close controls all reach `App.tsx`'s `closeTab`. So changing `guardedOpenQuitConfirm` covers every trigger path, and no caller changes.

**`useUnsavedQuitGuard` keeps the entry point and `beforeunload`.** `guardedOpenQuitConfirm` calls `quitWalkRef.current?.()` when `anyDirtyTab` is true and falls back to `openQuitConfirm` when the walk didn't start (false or no guard mounted). `unsavedQuitOpen`, `confirmUnsavedQuit`, and `cancelUnsavedQuit` are removed with the dialog they served. The hook takes `quitWalkRef` in place of `runCommand`. `App.tsx` creates `quitWalkRef` and `saveWalkOpenRef` beside `guardRef` and passes `onQuit` as `() => runCommand('quit')`, the same call the retired dialog's confirm made, so the app's normal exit sequence runs. `App.tsx` is at 168 effective lines and this adds a handful, well under the limit.

**Cmd+W stays inert during the walk.** `useCmdW` and the dialog's key trap both listen on the window in capture phase, so the dialog alone does not guarantee Cmd+W is swallowed. `useCmdWRefs` takes `saveWalkOpenRef` in place of `unsavedQuitOpen`, and `quitConfirmOpenRef` reads `quitConfirmOpen` or `saveWalkOpenRef.current`, through a getter like `keyboardCapturedRef`'s. Without this, Cmd+W mid-walk on the last tab would restart the walk.

**`AppMain`** stops rendering `UnsavedQuitDialog`, drops the `unsavedQuitOpen` prop, and passes the new props to `CloseSaveGuard`.

**Specs.**
- `product/specs/quit-confirmation.md`, "Unsaved changes": replace the one-dialog paragraph with the walk. Name every rule from Design decisions: order, title wording, reveal, selection carry-over, Cancel and failure stop the quit with earlier saves kept and Don't Save tabs still dirty, skipped tabs, and quitting right after the last answer. Keep the paragraph on what counts as unsaved work and the paragraph on per-tab close.
- `product/specs/editor-tab.md`, "Closing with unsaved changes": the paragraph on `quit` now says quitting walks every dirty tab through this same dialog, titled with the tab's name, and points to `quit-confirmation.md`.
- `product/specs/image-tab.md`, "Unsaved edits": check the sentence pointing at `[[quit-confirmation]]` still reads true; an image tab is walked like an editor tab and **Save** replaces the original file.

**User documentation.**
- `help/quit.md`: replace "the dialog reads 'You have unsaved changes. Close anyway?' instead, and confirming discards them" with a short description of the walk.
- `documentation/user-documentation/command-bar/commands.md`: replace the "Close anyway" paragraph the same way.

## UI design

The feature extends the whole-app quit path (`useUnsavedQuitGuard` and the dialogs rendered from `web/src/AppMain.tsx`) and resembles the per-tab `CloseSaveGuard` flow with `SaveChangesDialog`, whose title today reads "Do you want to save changes to this file?".

- **Placement.** Each step is the existing `SaveChangesDialog`: the same centred modal over the backdrop (`ModalDialog`, `.modal` / `.modal-title` / `.modal-actions` in `web/src/theme.css`), the same three `.modal-button` buttons in the same order, only the title text differs.
- **The asked-about tab is brought on screen.** Before each tab's dialog opens, that tab becomes the current tab through the existing `focusTab` request (by label), so its unsaved content shows behind the backdrop. Tab switching is server state; the client only sends the intent. A tab docked in a sidebar is instead selected in its sidebar, the way a notification click reveals a docked tab.
- **Long names wrap.** The walk's dialog keeps its usual size up to a capped maximum width; past that the title wraps onto more lines and breaks inside a long word if needed. The full name is always shown, never truncated. The cap applies to the walk's dialog only, through a class passed to `ModalDialog`, so other modals are unchanged.
- **Interaction and keys.** The same keys as the single-tab dialog: `y` saves, `n` discards, `Escape` cancels, `←` / `→` move the selection, `Enter` runs the selected button. No new key binding is added, so nothing in the key reference collides. Clicks outside the dialog do nothing, and the window-level capture trap applies throughout the walk, including between one tab's answer and the next tab's dialog.
- **Selection carries over.** The first tab's dialog opens with Save selected. Each later tab's dialog opens with whichever button was selected when the previous tab was answered, so `Enter` repeats the last choice. `y` and `n` still act regardless of the selection.
- **States.** While a save is running, Save is disabled and repeated `y` / `Enter` / clicks on it do nothing, while Don't Save and Cancel stay available, as in the single-tab dialog today. There is no empty state: the walk only starts when at least one tab is dirty.
- **Focus.** Focus moves onto the dialog each time it opens. On Cancel, the walk ends and focus goes into the tab that was being asked about, at its cursor, through that tab's `DirtyTabHandle.focus()`, the same as Cancel on the single-tab close dialog. A failed save lands the same way. When the walk completes, the app exits, so there is no landing focus.
- **Accessibility.** The dialog keeps `role="alertdialog"` with the title as its visible heading, and the buttons keep their accessible names `Save (y)`, `Don't Save (n)`, and `Cancel (Esc)`.
- **Code organization.** Client-only. The walk's decisions — which tabs to visit, in what order, what to do after each answer — live in a pure module with no React, a hook owns the walk's state and effects, and the component that renders the dialog stays thin, per `ai/guidelines/react-code-organization.md`. Tab order, tab names, and the current tab come from server state (`TabView[]` and `focusTab`); the client holds only which tab is being asked about and the carried selection, per `ai/guidelines/architecture-principles.md` §1.

## Tests

- `web/src/unsaved-work/save-walk.test.ts` (new): `nextWalkLabel` follows tab-list order and returns only dirty tabs. It returns undefined when none are dirty or all are answered, skips answered labels, and passes over a tab that is gone or no longer dirty. `walkTitle` produces the exact wording.
- `web/src/shared/tab/tab-name.test.ts` (new): editor name, then title, then label.
- `web/src/unsaved-work/SaveChangesDialog.test.tsx`, moved, with added cases: a `title` prop replaces the default; with a controlled selection, arrows call `onSelect` and Enter runs the passed `selected` button; with no new props, every existing case passes unchanged.
- `web/src/unsaved-work/CloseSaveGuard.quit-walk.test.tsx` (new, beside the moved close tests). Use two or three fake dirty handles and assert on `client.send` and `onQuit`:
  - the walk asks in tab-list order and sends `focusTab` for each label before its dialog;
  - a label `revealDocked` accepts is not sent as `focusTab`;
  - the title names each tab;
  - Save then Don't Save then Save calls each save in turn and `onQuit` once, after the last save resolves;
  - Don't Save sends no `closeTab`;
  - Cancel on the second tab calls no further save, never calls `onQuit`, and focuses that tab;
  - a rejected save stops the walk, never calls `onQuit`, and focuses that tab;
  - a save that resolves after Cancel does nothing;
  - a tab removed from `tabs` while its dialog is open is skipped on the next button press;
  - the selection carries from one tab to the next;
  - `saveWalkOpenRef` is true during the walk and false after Cancel.
- `web/src/unsaved-work/useUnsavedQuitGuard.test.ts`, moved. "opens the unsaved-quit dialog instead of the raw confirm when a tab is dirty" and the dirty-plugin-tab case become "calls `quitWalkRef` and not `openQuitConfirm`". Add: a walk that returns false, or no `quitWalkRef` set, falls back to `openQuitConfirm`. Delete the `confirmUnsavedQuit` and `cancelUnsavedQuit` cases; the guard's walk test covers quitting. The `beforeunload` cases stay unchanged.
- `web/src/useCmdWRefs.test.ts`: "ORs quitConfirmOpen with unsavedQuitOpen" becomes the same check against `saveWalkOpenRef`, including that the ref is read live (flipping it after render changes `quitConfirmOpenRef.current` without a rerender).
- `web/src/useFocusOnTabSwitch.test.ts`: an `activeTab` change while `suppressRef` is true focuses nothing; with it false, the existing cases pass unchanged.
- Existing `CloseSaveGuard` close tests and the `QuitDialog` tests pass unchanged apart from import paths. `UnsavedQuitDialog.test.tsx` is deleted with its component.

## Out of scope

- Any change to the per-tab close dialog when other tabs remain open.
- The browser's own `beforeunload` prompt.
- Which tabs register unsaved work.
- Save All and Don't Save All shortcuts.
- A summary dialog ahead of the walk.
- A progress indicator in the walk.
- Renaming the single-tab close dialog's title.
- A `quit` sent by a schedule or another tab, which exits without asking today and keeps doing so.
- Any server or protocol change.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in the running app:
  - Open three editor tabs and edit the first and third without saving. Type `quit` in the second. The first tab comes on screen behind "Do you want to save changes to <its file name>?". Press `y`; the third tab comes on screen with its own title; press `n`. The app exits, the first file holds its edits on disk, and the third does not.
  - Repeat, then press `Escape` at the third tab's dialog. The app stays open on the third tab with the cursor in its buffer and its edits intact.
  - With one dirty editor tab and nothing else open, press Cmd+W. The walk asks about that one tab. Press Cmd+W again while the dialog is up; nothing changes.
  - With no unsaved work, type `quit`: the plain "Are you sure you want to quit?" dialog appears as before.
