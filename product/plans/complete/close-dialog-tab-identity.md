# Keep close-dialog targets tied to tab identity while the tab list changes

**Complexity: 4/10** — one piece of state in a small hook changes from a position to a label, and the one component that reads it resolves that label against the current tab list at each point it acts. Two files plus their tests; no wire, server, or dialog change.

## Goal

Make the save-changes dialog act on the tab the user was asked about, however the tab list moves while the dialog is open or a save is pending.

## Approach

`useSaveConfirm` stores the selected tab as `indexRef`, a position in an array the server replaces on every tab change. `CloseSaveGuard` then reads that position back out of the *latest* `tabs` snapshot to pick a handle for Save and Cancel, and sends it as the `closeTab` index for Save and Discard — including after awaiting a save, which is exactly when the list is most likely to have moved. A tab opened by an agent's plugin capability, a schedule firing, or a monitor's reporting tab arriving shifts every position after it, so the dialog can save, discard, close, or focus a tab the user never selected.

The tab's label is already the identity the handle map is keyed on, and the guard already has it in hand when it decides to raise the dialog. Capture that instead. Save and Cancel then look the handle up by label directly rather than going through a position, and the close command computes its index from the current snapshot at the moment it is sent — freshly again after an awaited save. If the captured label is no longer in the list, the dialog dismisses and closes nothing rather than closing whatever now sits at that position.

This is deliberately confined to dialog targeting. `closeTab` remains an index on the wire and the server still resolves it against its own current array, so a smaller race between sending the close and the server executing it stays open; making the wire command name a tab is separate work.

## Implementation steps

1. Change `web/src/SaveChangesDialog/useSaveConfirm.ts` to hold the selected tab's label: `openSaveConfirm(label: string)` writes a `labelRef`, and the hook returns that ref in place of `indexRef`.
2. In `web/src/CloseSaveGuard.tsx`, pass `tab.label` to `openSaveConfirm` from the guard callback, which already resolved the tab before checking its handle. The guard's own `(index: number) => boolean` signature is unchanged — its callers still speak in positions.
3. In the same file, resolve the handle by `labelRef.current` for Save and Cancel, and add a small closing helper that finds the label's current index in `tabsRef.current` and sends `closeTab` only when it is still present. Call it after the awaited save for Save, and directly for Discard.

## Tests

`web/src/CloseSaveGuard.test.tsx` — its existing cases hold the tab list fixed for the whole gesture, and all must keep passing. Added:

- A tab inserted before the selected one while the dialog is open: Save writes through the original tab's handle and closes at its new index, not the old one.
- A tab removed from before the selected one while the dialog is open: Discard closes at the shifted index.
- The selected tab itself removed while the dialog is open: Save and Discard both send no `closeTab`.
- A tab inserted while a deferred save is pending: the close goes to the index the selected tab holds after the save resolves, not the one captured when it started.
- Cancel after a reorder focuses the originally selected tab's handle.

## Spec updates

`product/specs/editor-tab.md` — under "Closing with unsaved changes", state that the dialog stays attached to the tab it was raised for even if the tab list changes underneath it, and that it closes nothing if that tab is gone by the time a button is pressed.

## Docs

None. `documentation/user-documentation/tab-types/editor.md` describes the dialog's three buttons and says nothing about what happens when the tab list moves underneath it, so nothing there is now wrong. `help.md` does not cover the dialog.

## Out of scope

- The index-based `closeTab` wire command in `src/protocol/core-rpc.ts` and its resolution in `src/tab/close.ts`.
- The guard callback's `(index: number) => boolean` signature, which its command-bar and tab-strip callers rely on.
- The quit dialog and the unsaved-quit guard, which act on no single tab.
