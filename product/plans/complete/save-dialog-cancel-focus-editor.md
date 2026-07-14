# Save Dialog Cancel Focus Editor

**Complexity: 1/10** — purely client-side, no new dependencies, no wire changes, two files changed.

## Summary

When closing an editor tab with unsaved changes, the Save/Discard/Cancel dialog appears. Pressing Escape or clicking Cancel dismisses the dialog but does **not** return focus to the editor — focus is lost to the `<body>`. The fix (a) exposes a `focus()` method on `EditorTabHandle` and (b) calls it in the cancel handler, matching the `QuitDialog`'s `requestAnimationFrame` focus-restoration pattern.

## Decisions

1. **`requestAnimationFrame` for focus timing.** Same pattern as `QuitDialog/useQuitConfirm.ts` — defers focus until after the dialog unmounts and its capture-phase event listeners are removed.
2. **Expose focus on `EditorTabHandle`** rather than threading a separate ref. The handle is already available in `CloseSaveGuard` via `editorHandles.current.get(tab.label)`, so no new wiring is needed.

## Proposed changes

### 1. `web/src/EditorTab.tsx`

- Add `focus: () => void` to the `EditorTabHandle` type.
- Add `focus: () => textareaRef.current?.focus()` to `useImperativeHandle`'s return object.

### 2. `web/src/CloseSaveGuard.tsx`

- Change `onCancel` from bare `closeSaveConfirm` to a callback that: looks up the editor handle for the dirty tab, calls `closeSaveConfirm()`, then uses `requestAnimationFrame` to focus the editor handle.

### 3. Tests: `web/src/CloseSaveGuard.test.tsx`

- Update the "onCancel button closes dialog without sending closeTab" test to verify that `focus` is called on the editor handle.

### 4. Specs: `specs/editor-tab.md`

- Add a sentence to the "Cancel (Esc)" bullet: "Focus returns to the editor at the current cursor position."

## Out of scope

- UnsavedQuitDialog focus restoration (the whole-app quit path) — separate issue.
- OverwriteConflictDialog focus restoration — separate issue.
- Any server-side or wire changes.
