# Stop Cmd+W and Shift+Tab from acting behind an open modal dialog

## Complexity

3/10. The change adds one small framework-free module in `web/src/shared/`, one registration in `useDialogKeyboard` and in the host `ConfirmDialog`, and an early return in `useCmdW` and `useSectionNav`. No server, wire, or protocol changes.

## Goal

Nothing in the client records whether a modal dialog is open. Each dialog traps the keyboard with its own capture-phase `keydown` listener on `globalThis` and calls `preventDefault()`/`stopPropagation()`, but `stopPropagation()` cannot stop other capture listeners on the same target. `useCmdW` in `web/src/useCmdW.ts` and `useSectionNav` in `web/src/useSectionNav.ts` are exactly such listeners, and both are registered when `App` mounts, so they run before any dialog's listener.

`useCmdW` bails only on `pickerOpenRef`, `routeRef`, and `quitConfirmOpenRef`, so with `SaveChangesDialog`, `HarnessLaunchDialog`, `ScheduleDialog`, the file-navigator conflict dialogs, a `ConfirmDialogShell` user, or the remote-session `ConfirmDialog` open, Cmd+W closes the active tab behind the dialog. `useSectionNav` has no check at all, so Shift+Tab moves focus out of any modal into a sidebar.

After this change both shortcuts do nothing while any dialog built on `useDialogKeyboard` (or the host `ConfirmDialog`) is mounted.

## Approach

- Add `web/src/shared/modal-open.ts`, a module-level open count with `openModal()` returning an idempotent release function and `isModalOpen()` reporting whether the count is above zero. It imports nothing, so any hook or component can use it without a React dependency.
- `useDialogKeyboard` calls `openModal()` inside its mount effect and releases it in the same cleanup that removes its listeners, so acquisition and release live together. Every dialog built on the hook (directly, through `useConfirmDialogKeys`/`ConfirmDialogShell`, or through `use-launch-dialog`) is then covered by default.
- The host `ConfirmDialog` in `web/src/shared/ConfirmDialog.tsx` keeps its own listener rather than `useDialogKeyboard`, so it registers the same way in its own mount effect.
- `useCmdW` and `useSectionNav` return early when `isModalOpen()` is true, or when the event's `defaultPrevented` is already set (which costs nothing and covers a listener that happened to register ahead of them).
- `useCmdW` keeps its existing ref checks: the pickers and the route chooser are not built on `useDialogKeyboard`, and the quit dialogs are already covered by `quitConfirmOpenRef`.

Rejected: switching `useCmdW` and `useSectionNav` to bubble-phase listeners so the dialogs' `stopPropagation()` would reach them. Both are capture-phase on purpose (Shift+Tab must beat xterm and the file navigator's own capture), so the order cannot change.

Rejected: a React context provider for the modal state. The readers are window-level listeners that must not re-register on every render, and a plain module read inside the listener is simpler than threading context values through refs.

## Implementation steps

1. Create `web/src/shared/modal-open.ts` with `openModal()` and `isModalOpen()`.
2. `web/src/shared/useDialogKeyboard.ts`: open the modal signal in the mount effect and release it in its cleanup.
3. `web/src/shared/ConfirmDialog.tsx`: open the modal signal in the mount effect and release it in its cleanup.
4. `web/src/useCmdW.ts`: return early on `e.defaultPrevented || isModalOpen()`.
5. `web/src/useSectionNav.ts`: return early on `e.defaultPrevented || isModalOpen()`.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/shared/modal-open.test.ts`: reports closed with nothing open; reports open until every opener releases; releasing the same handle twice does not close a second open modal.
- `web/src/shared/useDialogKeyboard.test.tsx`: the modal signal reports open while a dialog is mounted and closed after it unmounts.
- `web/src/shared/ConfirmDialog.test.tsx`: the modal signal reports open while the dialog is mounted and closed after it unmounts.
- `web/src/useCmdW.test.tsx`: with a dialog mounted through `useDialogKeyboard`, Cmd+W does not call `closeTab`; after it unmounts, Cmd+W closes the tab again; an already default-prevented Cmd+W does nothing. The existing picker, route-chooser, and quit-dialog cases keep passing unchanged.
- `web/src/useSectionNav.test.ts`: with a dialog mounted through `useDialogKeyboard`, Shift+Tab neither calls `focusCenter` nor moves focus into a sidebar.

## Out of scope

- `DeleteScheduleDialog` in `web/src/plugins/schedules/` reproduces the confirm contract with its own listener because a plugin may not import host UI. Registering it would mean publishing the modal signal through `web/src/plugins/api.ts`, which is a plugin API change.
- Folding the picker overlays and the quit dialogs into the same signal so `useCmdW` can drop its refs.
- Other window-level shortcuts outside `useCmdW` and `useSectionNav`.

## Documentation and specification impact

`product/specs/keyboard-navigation.md`: the Cmd+W row names open dialogs among the cases where it is a no-op, and the Shift+Tab row says it does nothing while a modal dialog is open. `help.md` and `documentation/user-documentation/` do not describe how either shortcut behaves under a dialog and are left alone.
