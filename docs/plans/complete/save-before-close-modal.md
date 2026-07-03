# Save unsaved changes modal on editor tab close

**Complexity: 5/10** — expose editor dirty/save via forwardRef, clone QuitDialog for a three-button save modal, guard three close paths. No server changes, no protocol changes.

## Goal

Closing an editor tab with unsaved changes triggers a "Save unsaved changes?" modal (like the quit dialog) so the user can save, discard, or cancel. The default action is Save.

## Background

`EditorTab` already tracks dirty state and has a private `save()` function. `App.closeTab()` sends a `closeTab` RPC with no guard. Three paths trigger close: the × button (calls `closeTab`), Cmd+W (calls `closeTab`), and the `close`/`exit` command (runs through `onSubmit`). None check for unsaved editor changes.

## Approach

1. **Expose EditorTab handle.** Convert `EditorTab` to `forwardRef` with `useImperativeHandle`, exposing an `EditorTabHandle = { isDirty(): boolean; save(): Promise<void> }`. This follows the exact pattern used by `HarnessTab` and `ShellTab`.

2. **Track handles in App.** App maintains a `Map<string, EditorTabHandle>` ref populated via callback refs on each `<EditorTab>`, keyed by tab label. Uses `tabsRef` to look up the label for a given index in `closeTab`.

3. **Create `SaveChangesDialog`.** Three-button modal ("Save" / "Don't Save" / "Cancel") cloned from `QuitDialog` with the same capture-phase event trapping. Default selection is Save. Keys: y=save, n=don't save, Escape=cancel, Left/Right move selection.

4. **Create `useSaveConfirm` hook.** Manages `saveConfirmOpen` state and `saveConfirmIndexRef` for the tab index whose close is pending. Same pattern as `useQuitConfirm`.

5. **Guard close paths.** In `closeTab`, check `editorHandles.get(tabLabel)?.isDirty()` before sending the RPC. In `onSubmit`, intercept `close`/`exit` when the active tab is a dirty editor. Cmd+W is covered by sharing `closeTab`.

## Implementation steps

1. Add `EditorTabHandle` type and convert `EditorTab` to `forwardRef` with `useImperativeHandle` exposing `isDirty()` and `save()`.

2. Create `web/src/SaveChangesDialog/SaveChangesDialog.tsx` — three-button modal cloning QuitDialog structure.

3. Create `web/src/SaveChangesDialog/useSaveConfirm.ts` — state hook for the save dialog flow.

4. Wire into `App.tsx`: add `editorHandles` ref Map, `tabsRef`, `saveConfirmOpen` state, guard in `closeTab`, guard in `onSubmit` for `close`/`exit` commands, render `SaveChangesDialog`.

5. Update `web/src/EditorTab.test.tsx` — add test that `isDirty()` returns true after edits and false after save, and `save()` calls `saveFile`.

6. Create `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx` — tests for rendering, button clicks, keyboard shortcuts, default selection, and unmount cleanup (following QuitDialog test patterns).

7. Run `./scripts/run.mjs check-diff` after each step.

## Testing

- `web/src/EditorTab.test.tsx` — new tests:
  - `isDirty()` returns false after load, true after edit, false after save
  - `save()` calls `client.saveFile` and resolves when save completes

- `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx` — new test file:
  - Renders title and three buttons
  - Cancel selected by default... wait, Save is default per the issue
  - Default is Save (y)
  - Enter runs selected option
  - y=save, n=discard, Escape=cancel
  - Left/Right move selection
  - Click outside backdrop does nothing
  - Unmount removes listeners

## Out of scope

- Warning on close of inactive dirty editor tabs via × button — only the active tab's close triggers the dialog
- Server-side changes
- Protocol changes

## Verification

`./scripts/run.mjs check-diff` must pass clean.
