# Suppress the browser context menu for an empty editor selection

**Complexity: 2/10** — a client-only event boundary in the editor tab, covered by its existing rendered-tab test suite.

## Goal

Right-clicking an editor tab with no selected text must not expose the browser context menu. A text selection must retain the shared default menu, including its contributed **Chat about this** action.

## Approach

The editor body already publishes its selection through `data-editor-selection`, which the shared default menu reads. Claim only an empty-selection context-menu event on that body. The shared document listener treats a prevented event as surface-owned, so it will neither show a custom menu nor permit the browser’s fallback menu. Leave selected events unclaimed so the existing Copy, Paste, and contributed-action behavior remains intact.

## Implementation steps

1. `web/src/editor/EditorTab.tsx` — add an editor-body context-menu handler that prevents the browser default only when the editor has no selected text.
2. `web/src/editor/EditorTab.test.tsx` — cover an empty-selection right-click and a selected-text right-click, asserting the former is claimed and the latter is left for the shared menu.
3. Update the editor and context-menu functional specs to describe the editor-specific empty-selection behavior.

## Tests

- `web/src/editor/EditorTab.test.tsx` — empty-selection right-click is prevented; a selection remains unclaimed for the default menu.

## Out of scope

- Changing menus for terminals, command inputs, or other default-menu surfaces.
- Changing Copy, Paste, or **Chat about this** behavior for a selected editor range.

## Verification

`./scripts/run.mjs check-diff`.
