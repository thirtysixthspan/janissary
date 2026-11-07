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
- `saveWalkOpenRef` is true for the whole walk, false before it starts, and false after Cancel, a failed save, or completion; opening a close request clears it defensively.

The walk's start, save, discard, and cancel handlers and the advance step live in `web/src/unsaved-work/useQuitWalk.ts`. `CloseSaveGuard` stays a thin component that chooses the close or walk handler set and title, and renders the dialog. The close-request handlers stay in the guard.

## Dependencies and ordering

This subplan depends on:

- `01-move-unsaved-work-modules` for the final directory and moved guard;
- `02-tab-full-name` for `tabFullName`;
- `03-save-walk-pure-module` for `nextWalkLabel` and `walkTitle`;
- `04-save-changes-dialog-variants` for `title`, controlled selection, `className`, the exported `SaveChoice` type, and the `.save-walk-dialog` class;
- `05-save-confirm-request-state` for the `SaveConfirmRequest` union, the two-mode request state, `advanceQuitWalk`, and generation protection.

Land `06` after `05` and before `07` and `08`; it is the only subplan that creates `useQuitWalk` and the walk branch, and it must not change the modules delivered by `01`–`05`. Subplan `07-focus-suppression-during-walk` consumes `saveWalkOpenRef`; `08-quit-entry-and-cmd-w` consumes `quitWalkRef` and deletes the retired dialog. Neither later change is reachable from a user gesture at the end of this subplan: `useUnsavedQuitGuard` still opens the old one-button dialog, so no caller invokes `startQuitWalk`. The walk is exercised directly through `quitWalkRef` in the new test file.

## Design decisions

### Guard props and close-mode compatibility

- `CloseSaveGuard` keeps its current props: `tabs`, `tabHandles`, `client`, and `guardRef`.
- It gains four optional props:
  - `quitWalkRef?: React.RefObject<(() => boolean) | null>`;
  - `saveWalkOpenRef?: React.RefObject<boolean>`;
  - `onQuit?: () => void`;
  - `revealDocked?: (label: string) => boolean`.
- The new props are optional with close-mode-safe defaults so every existing close-only render site and test keeps working without adding props. In production `App` passes all four through `AppMain`, where they are required fields. When `quitWalkRef` is absent, no walk can be started from outside; when `saveWalkOpenRef` is absent, the guard uses a private local `useRef(false)` for the walk flag; `onQuit` defaults to a shared module-level no-op; `revealDocked` defaults to a shared module-level function that always returns false. Use shared constants rather than inline lambdas so the fallbacks keep a stable identity and the `quitWalkRef` effect does not re-run on every render.
- The guard's `guardRef` contract is unchanged: `(index: number) => boolean`. It resolves the tab at that index from the current tab list, asks its handle `isDirty()`, opens the close request when dirty, and returns true; otherwise it returns false. The close request is one tab and closes it after Save or Don't Save, exactly as today. Opening a close request also sets the effective walk flag (the `saveWalkOpenRef` prop or the local fallback) to false before `openClose`, so the flag cannot read true outside a walk even if a close is somehow requested while one is open. Add the stable effective ref object to the existing `guardRef` effect's dependency list; its identity does not change, so the effect still publishes once per `tabHandles`/`openClose` change.
- `quitWalkRef` is published by a separate effect whose dependency list is the ref and `startQuitWalk`; its cleanup clears the ref. Do not fold it into the close `guardRef` effect: a changing `startQuitWalk` must not churn the close publication. `startQuitWalk` returns true without changing anything when any save-confirm request is already open — a quit walk or a defensive close; it never resets the walk, replaces the dialog, or sends another reveal. Otherwise it starts the walk when `nextWalkLabel` finds a dirty tab and returns false when it does not. A walk that is already open keeps `saveWalkOpenRef` true, and a close keeps it false. In this subplan no user gesture reaches the walk, so this is only a defensive guard against a stray call; the trigger suppression arrives with subplans `07` and `08`.
- `saveWalkOpenRef` is set true only when a walk actually starts. It stays true across advances and while a save is pending. It is set false before the walk dismisses on Cancel, before it dismisses on a failed save, and before it dismisses on completion. The close mode never sets it true; opening a close request clears it to false defensively. No unmount cleanup writes it: `CloseSaveGuard` unmounts with `App`, which owns the ref, so the writers above are the only ones.

### `useQuitWalk` contract

`useQuitWalk` takes one options object: the live `tabs: readonly TabView[]`, the `tabHandles` map ref, `client`, `onQuit`, `revealDocked`, the effective `saveWalkOpenRef`, and the request-state pieces from `useSaveConfirm`: `request: SaveConfirmRequest | null`, `startSave`, `isCurrentAttempt`, `openQuitWalk`, `advanceQuitWalk`, and `dismiss`. It returns `start(): boolean`, an async `save()`, `discard()`, `cancel()`, and `title: string | undefined`. Import the `SaveConfirmRequest` type with `import type` from `./useSaveConfirm`; do not define a second request alias. Do not pass `select`, `saving`, `saveConfirmOpen`, or `labelRef` to the hook: the guard keeps those for the dialog and close branch, and the walk reads its label from `request`.

`useQuitWalk.ts` imports only React, `TabView` from `@shared/protocol`, `JanusClient` from `../shared/ws/ws`, `DirtyTabHandle` from `../shared/tab/handles`, `tabFullName` from `../shared/tab/tab-name`, `nextWalkLabel` and `walkTitle` from `./save-walk`, and the `SaveConfirmRequest` type. It must not import `../sidebar-selection-coordinator`, `../notifications/*`, `../useFocusOnTabSwitch`, `../useCmdWRefs`, `../App`, `../AppMain`, or `../QuitDialog/*`; `revealDocked` and `onQuit` are props, which is what keeps the feature-zone boundary intact.

- `save`, `discard`, `cancel`, and the advance step begin by checking that `request?.kind === 'quit'`; otherwise they return without revealing, saving, advancing, dismissing, or quitting. A close request replacing the walk must make every walk handler inert immediately, even if a stale event is still queued.
- It keeps the live tab list in a ref updated each render, as `CloseSaveGuard` does today. `start`, `save`, `cancel`, and the advance step read `tabsRef.current` and `tabHandles.current` at call time, never the `tabs` or handle map captured by the render that created the handler; `discard` delegates to the same advance step. A save that resolves after the list changed therefore compares labels against the list as it stands at that moment, and `advance` skips a tab that closed while the save was pending.
- Its dirty lookup is a label-to-boolean function built from `tabHandles.current.get(label)?.isDirty() === true`. A tab with no handle reads clean, matching `anyDirtyTab` and the `nextWalkLabel` contract from subplan `03`.
- `start` first checks the effective walk flag and `request`. If a walk is open, or any save-confirm request is open, it returns true and changes nothing. Otherwise it asks `nextWalkLabel` with `tabsRef.current`, the dirty lookup, and an empty answered set. On `undefined` it returns false and changes nothing, including the flag. Otherwise it sets the effective walk flag true, reveals that label, calls `openQuitWalk(label)` (which resets the selection to `'save'` and the answered set to empty), and returns true. The flag is set before the reveal so subplans `07` and `08` see it from the first render the tab switch causes.
- `reveal(label)` first calls `revealDocked(label)`. If it returns true, a sidebar consumed the label and no `focusTab` is sent; if it returns false, it sends `client.send({ method: 'focusTab', params: { label } })`. This is the same order as the notification path at `web/src/notifications/native-notifications.ts:46` (`if (!placement.reveal(event.tab)) this.client.send({ method: 'focusTab', ... })`). Direct `sidebarSelectionFor(client).select` is equivalent to `placement.reveal` for this case because the selectors registered by `useSidebarSelection` accept only entries with `tab.dock === side && !tab.hidden` (`web/src/useSidebarSelection.ts:14`, `:59-63`); a center tab cannot be swallowed by a sidebar. A docked tab in a collapsed sidebar is selected but may stay out of sight; its title still names it. A hidden tab is rejected by those same selectors even when it also carries a dock, and the server ignores the `focusTab` request for it (`src/tab/navigation-commands.ts:25`, `if (tabs[index]?.dock || tabs[index]?.hidden) return;`), so the title alone names it. `App` must wrap the bare `select` method in a callback; passing `select` unbound would lose its `this.selectors` receiver.
- `title` is computed during render from `request`. For a quit request it resolves the request label against the current `tabs` and returns `walkTitle(tabFullName(tab))`; if the label is no longer in `tabs` while its dialog is still open, it falls back to `walkTitle(label)` so the dialog always has a name. It is undefined for a close request or no request. `tabFullName` is nullish, not truthy: an empty editor name or title is used verbatim, and the label fallback is only for a tab that is gone. Do not add a `||` fallback around the editor name; `web/src/shared/tab/tab-name.test.ts:28` already pins the empty-name behavior.
- `save`:
  - If the current label is no longer in `tabsRef.current` or has no handle, advance without saving, because the source plan treats "no handle" the same as "tab gone".
  - Otherwise call `startSave()`. If it returns undefined, a save is already pending and the press is a no-op.
  - Resolve the handle from the attempt's label, the same label the close branch uses. Await `handle.save()` inside a `try`/`catch`; never let the rejection escape to `SaveChangesDialog`, which does not await `onSave`.
  - On reject, if `isCurrentAttempt(attempt)`, set the effective walk flag false, dismiss, and call the captured handle's `focus()`.
  - On resolve, if `isCurrentAttempt(attempt)`, advance.
  - A resolve or reject after Cancel, after an advance, after a fresh request, or after unmount is ignored through `isCurrentAttempt`; do not add a second cancellation flag.
  - Do not add a dirty check at press time. A tab that is still present with a handle is saved even if its `isDirty()` has since turned false; the source plan's only skip condition is gone or no handle.
- `discard`: advance without saving, closing, or focusing anything. If a save for this tab is still running, `advanceQuitWalk` bumps the generation and clears the pending flag, so the later result is ignored; a write already started may still finish. Don't Save stays available while Save is pending.
- `cancel`: if the current label is no longer in `tabsRef.current` or has no handle, advance like any other button press, because the source plan treats "no handle" the same as "tab gone". Otherwise set the effective walk flag false, dismiss, then call the handle's `focus()`. The flag must go false before the focus call so the explicit focus is the last word once subplan `07` lands. This is the same landing as Cancel on the single-tab close dialog when the tab is still answerable.
- The advance step:
  - Requires a quit request; otherwise it returns without touching anything.
  - Builds an answered set from `request.answered` plus `request.label`.
  - Asks `nextWalkLabel` over `tabsRef.current` with that set.
  - If a next label exists, reveals it first, then calls `advanceQuitWalk(next)`. Reveal-before-advance matches the source plan and guarantees the server focus intent is sent before the next dialog mounts; do not put the reveal in an effect keyed to the request, because StrictMode's development effect replay would send a duplicate `focusTab` and could double-advance. `advanceQuitWalk` owns the transition: it adds the previous label to the answered set and carries `previous.selection` from its functional updater, so a selection change made while Save was pending reaches the next tab. Do not call `select` or set the request from `useQuitWalk`.
  - If none exists, set the effective walk flag false, dismiss, and call `onQuit`.
- The "tab gone" rule applies to every button, including Cancel, as the source plan states: if the label has no handle or is no longer in `tabsRef.current` when a button is pressed, nothing is saved for it and the walk moves on to the next dirty tab, or quits if none remain. Cancel on a still-present, still-handled tab stops the whole quit.
- The walk never sends `closeTab`. It never writes a file itself; it only awaits the existing `DirtyTabHandle.save()`.
- The walk does not add a progress line, Save All, or Don't Save All.
- StrictMode: no effect starts, advances, reveals, or dismisses the walk. The `tabsRef.current = tabs` assignment is idempotent under React's development double render, and `useSaveConfirm`'s unmount cleanup only bumps its generation counter; an attempt created after mount stays current, and a late save is still governed by `isCurrentAttempt`. The `quitWalkRef` effect's cleanup/setup replay runs before any walk can start, so it cannot cancel an active walk. A duplicate effect replay must never produce a second `focusTab` or a second `onQuit`.

### Dialog rendering

- The close-only render gate becomes a null-request gate: keep `saveConfirmOpen` as the open check and narrow on `request === null`, so both close and quit requests reach a branch. Call `useQuitWalk` and publish `quitWalkRef` before that gate; the hook is unconditional even when no dialog is open.
- When the request is a close, the guard renders the existing `SaveChangesDialog` with the close handlers, the default title, and uncontrolled selection, exactly as today. It passes no `key` in this branch.
- When the request is a quit, the guard renders `SaveChangesDialog` with:
  - `key` equal to the current label, so each step remounts the dialog and `useDialogKeyboard` focuses it again;
  - `title` from `useQuitWalk`;
  - `selected` from the request's `selection` and `onSelect` from `useSaveConfirm`'s `select`;
  - `className` equal to `save-walk-dialog`, the class defined at `web/src/theme.css:662`;
  - `saving` from the request state;
  - the walk's save, discard, and cancel handlers.
- The first tab's dialog opens with Save selected because `openQuitWalk` resets the selection to `'save'`; do not call `select('save')` separately. Later tabs open with whatever was selected when the previous tab was answered; `y` and `n` still act regardless of that selection.
- Clicks outside do nothing while a walk dialog is mounted, and each step mounts the shared `useDialogKeyboard` trap (`web/src/shared/useDialogKeyboard.ts:34`, which focuses the dialog and captures window-level keydown and click). The old dialog stays mounted until a save resolves or a button advances the request, so there is no untrapped step boundary; the effective walk flag is what subplans `07` and `08` use to cover the window before the first dialog and between steps.

### App and AppMain wiring

- `App` declares `quitWalkRef` (`useRef<(() => boolean) | null>(null)`) and `saveWalkOpenRef` (`useRef(false)`) directly above the `useUnsavedQuitGuard` destructuring and call at `web/src/App.tsx:125-126`, and moves the existing `guardRef` declaration from `web/src/App.tsx:127` up with them. `quitWalkRef` must exist before that call because subplan `08` passes it into `useUnsavedQuitGuard`; `saveWalkOpenRef` must exist before the `useCmdWRefs` call at `web/src/App.tsx:128` and the `useFocusOnTabSwitch` call at `:165` that subplans `08` and `07` update. Moving `guardRef` changes no consumer: every use (`closeTab`'s `guardRef.current?.(index)` at `web/src/App.tsx:144`, `useAppCommandLine`'s `guardRef` argument at `:183-184`, and the `AppMain` prop at `:220`) is below the new location.
- `App` passes `onQuit` as a stable `useCallback` that calls `runCommand('quit')`, the same call the retired dialog's confirm made. Do not pass an inline lambda that changes identity every render: a new identity would re-create the walk handlers and re-render the dialog, and it can re-run the `quitWalkRef` publishing effect if `startQuitWalk` is memoized over it.
- `App` passes `revealDocked` as a stable `useCallback` that wraps `sidebarSelectionFor(client).select(label)`; do not pass the bare `select` method because it reads `this.selectors` and would lose its receiver. This is the same coordinator `App.tsx:65` hands to `useNativeNotifications`. The guard's prop type is inline `(label: string) => boolean`, and `useQuitWalk` receives it as a prop, so the feature never imports the app-shell coordinator type or module. The selectors registered by `useSidebarSelection` accept only docked, non-hidden labels, so a center tab is never swallowed.
- `AppMain` gains the four props as required fields in `AppMainProps` (only `App` renders it) and passes them to `CloseSaveGuard`, where they remain optional. It does not render anything new; the dialog is still rendered by the guard. `AppMain.tsx` is 103 effective lines today and the additions are about 8–10, well under the limit.
- The old `unsavedQuitOpen` prop, the old `UnsavedQuitDialog` render, and `confirmUnsavedQuit`/`cancelUnsavedQuit` stay in place until subplan `08`.
- `App.tsx` is 168 effective lines today; the two refs, two stable callbacks, four `AppMain` prop names, and the `guardRef` move add about 10–12, landing near 178–180. Do not put any other work in `App.tsx` in this subplan. `CloseSaveGuard.tsx` is 67 effective lines today; the close branch stays and the walk branch plus the two ref effects should add roughly 35–45, landing near 105. Keep the guard under 150 effective lines; if it would exceed that, extract the quit-mode `SaveChangesDialog` element into a presentational `QuitWalkDialog.tsx` in the same directory, passing the title, selected choice, `onSelect`, saving flag, class, and three handlers, and keep the label `key` on the element the guard renders, rather than compacting the guard. The close branch and its handlers stay in the guard. `useQuitWalk.ts` is new and should stay near 100–130 effective lines; if it would exceed 160, extract the reveal helper into `walk-reveal.ts` in the same directory rather than compressing the hook. Never let any of these files approach the 200-line limit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Single-tab guard | `web/src/unsaved-work/CloseSaveGuard.tsx` (after subplan `01`) | Generalized in place. The close handlers and `guardRef` behavior stay. |
| Request state | `web/src/unsaved-work/useSaveConfirm.ts` (from subplan `05`): `SaveConfirmRequest` at `:9`, the hook at `:13` | Supplies `request` (`kind`, `label`, `answered`, `selection`), `saveConfirmOpen`, `saving`, `startSave`, `isCurrentAttempt`, `openClose`, `openQuitWalk`, `advanceQuitWalk`, `dismiss`, and `select`. The walk uses `request`, `startSave`, `isCurrentAttempt`, `openQuitWalk`, `advanceQuitWalk`, and `dismiss`; the close branch keeps `labelRef`, `startSave`, `isCurrentAttempt`, `dismiss`, `saving`, `saveConfirmOpen`, `select`, and `openClose`. |
| Dirty-tab contract | `web/src/shared/tab/handles.ts:21` (`DirtyTabHandle.isDirty`, `save`, `focus`) | The only per-tab operations the walk calls. No new tab contract. |
| Dirty-tab registry | `web/src/App.tsx:113` (`tabHandles` map keyed by label) | Passed through the guard as today. The walk reads handles by label. |
| Whole-app dirty check | `web/src/unsaved-work/dirtyTabs.ts:12` (`anyDirtyTab`) | Used by the quit entry point in `08`; the guard's start uses the same handle-map semantics through `isDirty`. |
| Walk decisions | `web/src/unsaved-work/save-walk.ts:7` (`nextWalkLabel`), `:17` (`walkTitle`) | Called for the first label and every advance. |
| Tab full name | `web/src/shared/tab/tab-name.ts:5` (`tabFullName`) | Builds the walk title. |
| Save dialog | `web/src/unsaved-work/SaveChangesDialog.tsx` (from subplan `04`): `SaveChoice` at `:5`; `title`, controlled `selected`/`onSelect`, and `className` from subplan `04`; `saving` is the existing pending flag | Rendered for both modes; the walk passes `title`, controlled selection, `className="save-walk-dialog"` (defined at `web/src/theme.css:662`), and `saving`. |
| Tab focus RPC | `src/protocol/core-rpc.ts:19` (`focusTab`), `src/controller/tab-adapter.ts:29` (`focusTab: (label) => managers.tab.setActiveTab(managers.tab.findIndex(label))`), `src/tab/navigation-commands.ts:25` (returns early when `tabs[index]?.dock` or `tabs[index]?.hidden`) | The reveal path for center tabs. No protocol change. |
| Docked reveal | `web/src/sidebar-selection-coordinator.ts:25` (`select(label): boolean`), `web/src/useSidebarSelection.ts:14` and `:59-63` (selectors accept only docked, non-hidden labels), `web/src/notifications/native-notifications.ts:46` with `web/src/notifications/alert-placement.ts:24-26` (sidebar first, then `focusTab`) | `App` passes `sidebarSelectionFor(client).select` wrapped in a callback as `revealDocked`; the walk follows the notification order. |
| Quit execution | `web/src/QuitDialog/useQuitConfirm.ts:10` (`runCommand('quit')`), `src/commands/quit.ts:8` (`messageBus.emit('app', { type: 'exit' })`) | `onQuit` uses the same call. No server change. |
| Guard/ref test conventions | `web/src/unsaved-work/CloseSaveGuard.test.tsx` (after subplan `01`) and the `tab` factory at `web/src/unsaved-work/save-walk.test.ts:5` | The new quit-walk test uses the same `React.createRef` handle-map helper, `client.send` spy, and `act`/`fireEvent` patterns, plus a full `TabView` factory with `title`/`editor` overrides. |

## Proposed changes

- Add `web/src/unsaved-work/useQuitWalk.ts` with the contract described above, including its import boundary.
- Extend `web/src/unsaved-work/CloseSaveGuard.tsx` to:
  - keep the close request branch and its handlers unchanged;
  - call `useQuitWalk` unconditionally before the render gate;
  - replace the close-only render gate with a null-request gate so both request kinds reach the dialog;
  - publish `startQuitWalk` through `quitWalkRef` in a separate effect when supplied;
  - pass the close branch's default title/uncontrolled selection and the quit branch's title, controlled selection, class, and handlers to `SaveChangesDialog`;
  - keep the current `tabsRef` and `guardRef` publication for the close path, adding only the effective walk-flag clear when a close request opens.
- In `web/src/App.tsx`, move `guardRef` above `useUnsavedQuitGuard`, add `quitWalkRef` and `saveWalkOpenRef` there, add the stable `onQuit` and `revealDocked` callbacks, and pass all four to `AppMain`.
- In `web/src/AppMain.tsx`, add the four required props to the type and destructuring and pass them to `CloseSaveGuard`.
- Do not change `useUnsavedQuitGuard`, `useCmdWRefs`, `useCmdW`, `useFocusOnTabSwitch`, `UnsavedQuitDialog`, `useSaveConfirm`, `save-walk.ts`, `SaveChangesDialog.tsx`, `tabFullName`, or `dirtyTabs` in this subplan.

## Tests

In `web/src/unsaved-work/CloseSaveGuard.quit-walk.test.tsx` (new, beside the moved close tests), build one `setup` helper that takes a tab list and a handle map, creates `quitWalkRef` and `saveWalkOpenRef` with `React.createRef` (the existing `makeGuardRef` pattern) or plain `{ current }` objects, spies on `client.send`, `onQuit`, and `revealDocked`, renders `CloseSaveGuard` with all props, and returns a `setTabs` rerender helper plus the spies and refs. The helper should accept a wrapper so one case can render the same guard inside `React.StrictMode`. Use the `tab` factory at `web/src/unsaved-work/save-walk.test.ts:5` for valid `TabView`s, adding `title` and `editor.name` overrides where the title cases need them; the `makeTab` cast in `CloseSaveGuard.test.tsx` lacks those fields. Use the deferred-promise pattern from `CloseSaveGuard.test.tsx:27-32` for pending saves. Assert on `client.send`, each handle's `save`/`focus`, `onQuit`, `revealDocked`, the dialog title, the selected button, and `saveWalkOpenRef.current`. Cover:

- The walk asks in tab-list order. With dirty `alpha` then `beta`, `quitWalkRef.current!()` returns true, the first dialog names `alpha`, and only after answering it does `beta` appear.
- `focusTab` is sent for each label before its dialog. `client.send` receives `{ method: 'focusTab', params: { label } }` in the order of the walk, with no `closeTab` calls.
- A label `revealDocked` accepts is not sent as `focusTab`; the next label that `revealDocked` rejects is sent. The sidebar callback is called with both labels, and the accepted label's dialog still opens.
- The title names each tab using its full name: editor name first, then title, then label. Use a tab with an editor name, one with only a title, and one with neither, so all three branches are visible.
- Removing the current tab from `tabs` while its dialog is open changes the title to `walkTitle(label)` (the gone-tab fallback) before any button is pressed.
- Every walk dialog carries the `save-walk-dialog` class; the close branch's dialog does not. The shared `SaveChangesDialog.test.tsx` already proves the class is applied when passed.
- Each step's dialog takes focus when it mounts. Capture the first `alertdialog` node, answer the first tab, and assert the new `alertdialog` is a different node and has focus; the identity change proves the label key remounts the dialog and `useDialogKeyboard` focuses it again.
- Save then Don't Save then Save calls each handle's `save` in turn, and `onQuit` is called exactly once after the last save resolves. The last save is deferred so the test proves `onQuit` waits for it.
- Don't Save sends no `closeTab`, does not call `save`, and advances to the next tab.
- Cancel on the second tab calls no further save, never calls `onQuit`, focuses the second tab, and sets `saveWalkOpenRef` false.
- A rejected save stops the walk, never calls `onQuit`, dismisses the dialog, focuses that tab, and sets `saveWalkOpenRef` false.
- A save that resolves or rejects after Cancel does nothing: no `onQuit`, no advancement, and no extra focus from the late result beyond Cancel's own focus call.
- A save in progress disables repeated Save attempts: two `y` presses or an `Enter` while pending call `save` once; Don't Save and Cancel remain available. Clicking Don't Save while that save is pending advances to the next tab, and the later resolve or reject does not advance again, focus, or call `onQuit`.
- The current tab removed from `tabs` while its dialog is open is skipped on any button press: `it.each` over Save, Don't Save, and Cancel asserts its `save` is not called, its `focus` is not called, and the next dirty tab's dialog opens (or the walk quits when none remain).
- The current tab's handle removed while the tab stays in `tabs` is treated the same way, again `it.each` over Save, Don't Save, and Cancel: the walk advances instead of saving or stopping.
- A tab already gone before its turn is skipped: start with `alpha`, `beta`, and `gamma` dirty, remove `beta` from `tabs` while `alpha`'s dialog is open, answer `alpha`, and assert `gamma` opens with no `beta` save, focus, or `focusTab`.
- The first dialog starts with Save selected. Select Don't Save with `ArrowRight`, answer with `y` (which still saves), and confirm the second dialog starts with Don't Save selected; pressing `Enter` then discards the second tab and quits.
- Calling `quitWalkRef.current!()` again while a walk is open returns true, keeps the current label and carried selection, sends no second `focusTab`, and leaves `saveWalkOpenRef` true; answering from there still completes exactly once.
- After Cancel, a second `quitWalkRef.current!()` starts over at the first dirty tab with Save selected and an empty answered set; the tab that was canceled is asked again.
- Calling `quitWalkRef.current!()` while a close request is open returns true, leaves the close dialog's default title in place, starts no walk, sends no `focusTab`, and leaves `saveWalkOpenRef` false.
- Opening a close request through `guardRef` while a walk is open replaces the walk with the close dialog and sets `saveWalkOpenRef` false; if a walk save was pending, its later resolve or reject does nothing.
- `saveWalkOpenRef` is true during the walk, remains true across an advance and while a save is pending, and is false after Cancel, after a failed save, after completion, and before the walk starts.
- `quitWalkRef.current!()` returns false when no tab is dirty, opens no dialog, sends no `focusTab`, and leaves `saveWalkOpenRef` false.
- Unmounting the guard clears `quitWalkRef.current` to null; a save that resolves or rejects after unmount calls no `onQuit` and no `focus`.
- Rendering the guard under `React.StrictMode` and completing a two-tab walk sends one `focusTab` per label and calls `onQuit` exactly once; the development effect replay must not duplicate the reveal or completion.
- The close path still renders the default title and uncontrolled selection: the existing `CloseSaveGuard.test.tsx` and `CloseSaveGuard.named-close.test.tsx` must pass unchanged with no new props and no import updates. Their render helpers do not pass the new optional props, which is the proof that the close mode is untouched. `SaveChangesDialog.test.tsx` and `useSaveConfirm.test.ts` must also pass unchanged. `App.test.tsx` needs no change in this subplan; `08` owns its retired-dialog cleanup.
- `useQuitWalk` has no separate test file in this subplan; the guard test is its integration point, and the pure decisions remain covered by `save-walk.test.ts`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; it should pick up the new guard test and the affected close/App suites. If the diff-scoped run does not select `SaveChangesDialog.test.tsx` or `useSaveConfirm.test.ts`, run them directly; neither module changes, but the guard consumes both. Then run a manual smoke in the running app:

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
- No change to `useSaveConfirm`, `save-walk.ts`, `SaveChangesDialog.tsx`, `tabFullName`, or `dirtyTabs`; `CloseSaveGuard.tsx`, `App.tsx`, and `AppMain.tsx` change only as described above.
- No new key binding and no change to the close dialog's title, keys, or uncontrolled selection.
- No new CSS or theme change; `.save-walk-dialog` and its title-wrap rule already exist from subplan `04`.
