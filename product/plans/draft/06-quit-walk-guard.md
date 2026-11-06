# Generalize the close guard into the quit walk

**Complexity: 5/10** — a new walk hook and a two-mode guard with async save, per-tab reveal, skip-gone handling, cancel/failure termination, and App prop threading. The core state machine is the feature, but every input it needs was built by subplans `01` through `05`.

## Goal

Implement the quit walk in the one guard the app already has:

- `CloseSaveGuard` publishes the existing single-tab check through `guardRef`, and a new `startQuitWalk(): boolean` through `quitWalkRef`.
- The walk asks about every dirty tab in tab-strip order, one at a time, using the existing `SaveChangesDialog` with the tab's full name as its title.
- Save writes and advances only after the write resolves; Don't Save advances without closing or discarding; Cancel stops the whole quit and focuses the tab; a rejected save stops the whole quit, dismisses, and focuses the tab.
- A tab that is gone when a button is pressed is skipped. A tab already gone before its turn is skipped because it is no longer in the current list.
- When the last dirty tab is answered, the guard dismisses and calls `onQuit`.
- Each asked-about tab is brought on screen before its dialog: `focusTab` normally, or the sidebar selection when `revealDocked` accepts the label.
- `saveWalkOpenRef` is true for the whole walk and false after Cancel, a failed save, or completion.

The walk's four button handlers and the advance step live in `web/src/unsaved-work/useQuitWalk.ts`. `CloseSaveGuard` stays a thin component that chooses the close or walk handler set and title, and renders the dialog. The close-request handlers stay in the guard.

## Dependencies and ordering

This subplan depends on:

- `01-move-unsaved-work-modules` for the final directory and moved guard;
- `02-tab-full-name` for `tabFullName`;
- `03-save-walk-pure-module` for `nextWalkLabel` and `walkTitle`;
- `04-save-changes-dialog-variants` for `title`, controlled selection, `className`, and the `.save-walk-dialog` class;
- `05-save-confirm-request-state` for the two-mode request state, `advanceQuitWalk`, and generation protection.

Subplan `07-focus-suppression-during-walk` consumes `saveWalkOpenRef`; `08-quit-entry-and-cmd-w` consumes `quitWalkRef` and deletes the retired dialog. Neither is reachable from a user gesture at the end of this subplan: `useUnsavedQuitGuard` still opens the old one-button dialog, so no caller invokes `startQuitWalk`. The walk is exercised directly through `quitWalkRef` in the new test file.

## Design decisions

### Guard props and close-mode compatibility

- `CloseSaveGuard` keeps its current props: `tabs`, `tabHandles`, `client`, and `guardRef`.
- It gains four optional props:
  - `quitWalkRef?: React.RefObject<(() => boolean) | null>`;
  - `saveWalkOpenRef?: React.RefObject<boolean>`;
  - `onQuit?: () => void`;
  - `revealDocked?: (label: string) => boolean`.
- The new props are optional with close-mode-safe defaults so every existing close-only render site and test keeps working without adding props. In production `App` passes all four. When `quitWalkRef` is absent, no walk can be started from outside; when `saveWalkOpenRef` is absent, the guard uses a private local ref for the walk flag; `onQuit` defaults to a no-op; `revealDocked` defaults to a function that always returns false.
- The guard's `guardRef` contract is unchanged: `(index: number) => boolean`. It resolves the tab at that index from the current tab list, asks its handle `isDirty()`, opens the close request when dirty, and returns true; otherwise it returns false. The close request is one tab and closes it after Save or Don't Save, exactly as today. Opening a close request also clears `saveWalkOpenRef` defensively, so the flag cannot read true outside a walk even if a close is somehow requested while one is open.
- `quitWalkRef` publishes `startQuitWalk` in an effect. Its cleanup clears the ref. `startQuitWalk` returns false when no tab is dirty. If a quit request is already open, it returns true without resetting the walk and leaves `saveWalkOpenRef` true; every trigger is suppressed during the walk, so this is only a defensive guard against a stray call.
- `saveWalkOpenRef` is set true only when a walk actually starts. It stays true across advances. It is set false before the walk dismisses on Cancel, before it dismisses on a failed save, and before it dismisses on completion. It is never set by the close mode.

### `useQuitWalk` contract

`useQuitWalk` receives the tab list, the handle-map ref, the client, `onQuit`, `revealDocked`, `saveWalkOpenRef`, and the request-state operations from `useSaveConfirm` (`request`, `startSave`, `isCurrentAttempt`, `openQuitWalk`, `advanceQuitWalk`, `dismiss`). It returns the walk's `start`, `save`, `discard`, and `cancel` handlers plus the current `title` (undefined outside a quit request).

- It keeps the live tab list in a ref updated each render, as `CloseSaveGuard` does today, so a save that resolves after the list changed resolves labels against the list as it stands at that moment.
- Its dirty lookup is a label-to-boolean function built from `tabHandles.current.get(label)?.isDirty() === true`. A tab with no handle reads clean, matching `anyDirtyTab`.
- `start` asks `nextWalkLabel` with the current tabs, that lookup, and an empty answered set. On `undefined` it returns false and changes nothing. Otherwise it sets `saveWalkOpenRef` true, reveals that first label, opens the quit request on it with `'save'` selected, and returns true.
- `reveal(label)` first calls `revealDocked(label)`. If that returns true, a sidebar consumed the label and no `focusTab` is sent. If it returns false, it sends `client.send({ method: 'focusTab', params: { label } })`. This is the same order as `web/src/notifications/native-notifications.ts:46`: offer the tab to the sidebar selection, then send the server focus intent only when no sidebar took it. A docked tab in a collapsed sidebar is selected but may stay out of sight; its title still names it. A hidden tab is neither docked nor switchable, so the server ignores the focus request and the title alone names it.
- `title` resolves the current quit request's label against the current tabs and returns `walkTitle(tabFullName(tab))`. If the tab is gone while its dialog is still open, it falls back to `walkTitle(label)` so the dialog always has a name. It is undefined for a close request.
- `save`:
  - If the current label is no longer in `tabs` or has no handle, advance without saving, because the source plan treats "no handle" the same as "tab gone".
  - Otherwise call `startSave()`. If it returns undefined, a save is already pending and the press is a no-op.
  - Await the handle's `save()`. On reject, if the attempt is still current, set `saveWalkOpenRef` false, dismiss, and call the handle's `focus()`.
  - On resolve, if the attempt is still current, advance.
  - A resolve or reject after Cancel, after an advance, or after unmount is ignored through `isCurrentAttempt`.
- `discard`: advance without saving or closing anything. If a save for this tab is still running, `advanceQuitWalk` bumps the generation and clears the pending flag, so the later result is ignored; a write already started may still finish. Don't Save stays available while Save is pending.
- `cancel`: if the current label is no longer in `tabs` or has no handle, advance like any other button press, because the source plan treats "no handle" the same as "tab gone". Otherwise set `saveWalkOpenRef` false, dismiss, and call the handle's `focus()`. This is the same landing as Cancel on the single-tab close dialog when the tab is still answerable.
- The advance step:
  - Requires a quit request.
  - Builds an answered set from the request's answered labels plus the current label.
  - Asks `nextWalkLabel` with that set over the current tabs.
  - If a next label exists, calls `advanceQuitWalk(next)`, then reveals it. The next request carries the latest selection; the dialog remounts keyed by label and takes focus again.
  - If none exists, sets `saveWalkOpenRef` false, dismisses, and calls `onQuit`.
- The "tab gone" rule applies to every button, including Cancel, as the source plan states: if the label has no handle or is no longer in `tabs` when a button is pressed, nothing is saved for it and the walk moves on to the next dirty tab, or quits if none remain. Cancel on a still-present, still-handled tab stops the whole quit.
- The walk never sends `closeTab`. It never writes a file itself; it only awaits the existing `DirtyTabHandle.save()`.
- The walk does not add a progress line, Save All, or Don't Save All.

### Dialog rendering

- When the request is a close, the guard renders the existing `SaveChangesDialog` with the close handlers, the default title, and uncontrolled selection, exactly as today.
- When the request is a quit, the guard renders `SaveChangesDialog` with:
  - `key` equal to the current label, so each step remounts the dialog and `useDialogKeyboard` focuses it again;
  - `title` from `useQuitWalk`;
  - `selected` from the request's `selection` and `onSelect` from `useSaveConfirm`'s `select`;
  - `className` equal to `save-walk-dialog`;
  - `saving` from the request state;
  - the walk's save, discard, and cancel handlers.
- The first tab's dialog opens with Save selected because `openQuitWalk` resets the selection to `'save'`. Later tabs open with whatever was selected when the previous tab was answered; `y` and `n` still act regardless of that selection.
- Clicks outside do nothing and the window-level capture trap applies throughout, including between one tab's answer and the next dialog, because each dialog mounts the shared `useDialogKeyboard` trap.

### App and AppMain wiring

- `App` creates `quitWalkRef` and `saveWalkOpenRef` beside `guardRef`, above the `useUnsavedQuitGuard` call. `quitWalkRef` must be declared before that call because subplan `08` passes it into the hook; `guardRef` can move with them without changing any consumer. Both refs are declared before the hooks that consume them.
- `App` passes `onQuit` as a stable callback that calls `runCommand('quit')`, the same call the retired dialog's confirm made. Do not pass an inline lambda that changes identity every render; the guard publishes it to `quitWalkRef` through an effect.
- `App` passes `revealDocked` as a stable callback that calls `sidebarSelectionFor(client).select(label)`. This is the same coordinator `App.tsx:65` hands to `useNativeNotifications`. The guard's prop type is inline `(label: string) => boolean`, so the feature never imports the app-shell coordinator type or module.
- `AppMain` gains the four props and passes them to `CloseSaveGuard`. It does not render anything new; the dialog is still rendered by the guard.
- The old `unsavedQuitOpen` prop, the old `UnsavedQuitDialog` render, and `confirmUnsavedQuit`/`cancelUnsavedQuit` stay in place until subplan `08`.
- `App.tsx` is 168 effective lines today; this adds only the two refs, two stable callbacks, and four prop names, well under the 200-line limit. `CloseSaveGuard.tsx` is 67 effective lines today; the close branch stays and the walk branch adds roughly 25, so it stays under the limit. If it passes 180 effective lines during implementation, move the close-branch dialog rendering into a small `CloseSaveDialog` component in the same directory rather than compacting the guard. `useQuitWalk.ts` is new and should stay near 100–130 effective lines; if it approaches 200, the reveal/advance helpers can move to a focused module in the same feature.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Single-tab guard | `web/src/unsaved-work/CloseSaveGuard.tsx` (after subplan `01`) | Generalized in place. The close handlers and `guardRef` behavior stay. |
| Request state | `web/src/unsaved-work/useSaveConfirm.ts` (from subplan `05`) | Supplies the request, generation, pending guard, open/advance/dismiss, and selection setter. |
| Dirty-tab contract | `web/src/shared/tab/handles.ts` (`DirtyTabHandle.isDirty`, `save`, `focus`) | The only per-tab operations the walk calls. No new tab contract. |
| Dirty-tab registry | `web/src/App.tsx:113` (`tabHandles` map keyed by label) | Passed through the guard as today. The walk reads handles by label. |
| Whole-app dirty check | `web/src/unsaved-work/dirtyTabs.ts` (`anyDirtyTab`) | Used by the quit entry point in `08`; the guard's start uses the same handle-map semantics through `isDirty`. |
| Walk decisions | `web/src/unsaved-work/save-walk.ts` (`nextWalkLabel`, `walkTitle`) | Called for the first label and every advance. |
| Tab full name | `web/src/shared/tab/tab-name.ts` (`tabFullName`) | Builds the walk title. |
| Save dialog | `web/src/unsaved-work/SaveChangesDialog.tsx` (from subplan `04`) | Rendered for both modes; the walk passes the new props. |
| Tab focus RPC | `src/protocol/core-rpc.ts:19` (`focusTab`), `src/controller/tab-adapter.ts:29` (`focusTab`), `src/tab/navigation-commands.ts:25` (ignores docked/hidden) | The reveal path for center tabs. No protocol change. |
| Docked reveal | `web/src/sidebar-selection-coordinator.ts:25` (`select`), `web/src/notifications/native-notifications.ts:46` (sidebar first, then `focusTab`) | `App` passes `select` as `revealDocked`; the walk follows the notification order. |
| Quit execution | `web/src/QuitDialog/useQuitConfirm.ts:10` (`runCommand('quit')`), `src/commands/quit.ts:8` (`messageBus.emit('app', { type: 'exit' })`) | `onQuit` uses the same call. No server change. |
| Guard/ref test conventions | `web/src/unsaved-work/CloseSaveGuard.test.tsx` (after subplan `01`) | The new quit-walk test uses the same fake tabs, handle map, `React.createRef` helper, `client.send` spy, and `act` patterns. |

## Proposed changes

- Add `web/src/unsaved-work/useQuitWalk.ts` with the contract described above.
- Rewrite `web/src/unsaved-work/CloseSaveGuard.tsx` to:
  - keep the close request branch and its handlers;
  - call `useQuitWalk` unconditionally;
  - publish `startQuitWalk` through `quitWalkRef` when supplied;
  - render the close or quit branch of `SaveChangesDialog` with the right title, selection, class, and handlers;
  - keep the current `tabsRef` and `guardRef` publication for the close path.
- In `web/src/App.tsx`, create `quitWalkRef` and `saveWalkOpenRef`, create the stable `onQuit` and `revealDocked` callbacks, and pass all four to `AppMain`.
- In `web/src/AppMain.tsx`, add the four props to the type and destructuring and pass them to `CloseSaveGuard`.
- Do not change `useUnsavedQuitGuard`, `useCmdWRefs`, `useCmdW`, `useFocusOnTabSwitch`, or `UnsavedQuitDialog` in this subplan.

## Tests

In `web/src/unsaved-work/CloseSaveGuard.quit-walk.test.tsx` (new, beside the moved close tests), use two or three fake dirty handles, a fake tab list with names, a `client.send` spy, an `onQuit` spy, a `revealDocked` spy, a `quitWalkRef`, and a `saveWalkOpenRef`. Assert on `client.send`, each handle's `save`/`focus`, `onQuit`, the dialog title, and the selected button. Cover:

- The walk asks in tab-list order. With dirty `alpha` then `beta`, `quitWalkRef.current!()` returns true, the first dialog names `alpha`, and only after answering it does `beta` appear.
- `focusTab` is sent for each label before its dialog. `client.send` receives `{ method: 'focusTab', params: { label } }` in the order of the walk, with no `closeTab` calls.
- A label `revealDocked` accepts is not sent as `focusTab`; the next label that `revealDocked` rejects is sent. The sidebar callback is called with the label.
- The title names each tab using its full name: editor name first, then title, then label. Use tabs with different combinations so the fallback is visible.
- Each step's dialog takes focus when it mounts, including the second step: after answering the first tab, the new `alertdialog` has focus. This proves the label-keyed remount reaches `useDialogKeyboard`'s focus effect again.
- Save then Don't Save then Save calls each handle's `save` in turn, and `onQuit` is called exactly once after the last save resolves. The last save is deferred so the test can prove `onQuit` waits for it.
- Don't Save sends no `closeTab` and does not call `save`; it advances to the next tab.
- Cancel on the second tab calls no further save, never calls `onQuit`, focuses the second tab, and sets `saveWalkOpenRef` false.
- A rejected save stops the walk, never calls `onQuit`, dismisses the dialog, focuses that tab, and sets `saveWalkOpenRef` false.
- A save that resolves after Cancel does nothing: no `onQuit`, no advancement, no focus from the late result.
- A tab removed from `tabs` while its dialog is open is skipped on the next button press: its `save` is not called, the walk moves to the next dirty tab, and the removed tab is not focused.
- A tab whose handle disappears while its dialog is open is treated like a gone tab for every button. Press Cancel on it and confirm the walk advances to the next dirty tab (or quits when none remain) instead of stopping.
- A tab already gone before its turn is skipped: with the tab list updated between steps, the next `nextWalkLabel` result is the following dirty tab.
- The selection carries from one tab to the next. Select Don't Save with `ArrowRight` on the first tab, answer with `y` (which still saves), and confirm the second dialog starts with Don't Save selected; pressing `Enter` then discards the second tab and quits.
- `saveWalkOpenRef` is true during the walk, remains true across an advance, and is false after Cancel. Also assert it is false before the walk starts and after completion.
- `quitWalkRef.current!()` returns false when no tab is dirty, opens no dialog, sends no `focusTab`, and leaves `saveWalkOpenRef` false.
- A save in progress disables repeated Save attempts: two `y` presses or an `Enter` while pending call `save` once; Don't Save and Cancel remain available.

The existing `CloseSaveGuard.test.tsx` and `CloseSaveGuard.named-close.test.tsx` must pass unchanged apart from their import paths. Their render helpers do not pass the new optional props, which is the proof that the close mode is untouched. `SaveChangesDialog.test.tsx` must also pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run a manual smoke in the running app:

- Closing one dirty tab while others remain still shows the single-tab dialog and closes only that tab after Save or Don't Save.
- Typing `quit` with a dirty tab still shows the old one-button "You have unsaved changes. Close anyway?" dialog, because subplan `08` has not switched the entry point yet. This is expected at this checkpoint.
- The new walk is exercised only through the guard test's `quitWalkRef`; there is no user gesture that reaches it yet.

## Out of scope

- No change to `useUnsavedQuitGuard`, the quit entry point, or the old one-button dialog; those are subplan `08`.
- No Cmd+W suppression change and no focus-suppression change; those are subplans `07` and `08`.
- No deletion of `UnsavedQuitDialog` or its test.
- No spec, help, or user-documentation edit.
- No protocol or server change.
- No Save All, Don't Save All, progress indicator, or summary dialog.
- No change to the per-tab close dialog when other tabs remain.
- No change to which tabs register unsaved work; the existing `DirtyTabHandle` registry is the only membership test.
