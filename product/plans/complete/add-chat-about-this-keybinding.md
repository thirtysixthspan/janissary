# Add a Chat about this key binding

**Complexity: 4/10** — a shared selection resolver must serve both the context menu and a direct keyboard activation, with focused behavior coverage and a spec update.

## Goal

`Cmd+I` on macOS and `Ctrl+I` elsewhere open **Chat about this** directly for the current selection.

## Approach

Reuse the default menu's selection resolution for DOM, editor, and terminal selections. The shortcut asks which action is available and runs that offered action, preserving the plugin boundary instead of naming an action locally.

## Implementation steps

1. Extract the default menu's selection resolution so right-click and keyboard activation use the same source precedence.
2. Handle the unclaimed Cmd/Ctrl+I chord by resolving the current selection and running the offered default-menu action.
3. Add context-menu tests for shortcut activation and the empty-selection case.
4. Document the shortcut in the context-menu spec and existing keyboard/editor user documentation.

## Tests

- `web/src/context-menu/DefaultContextMenu.test.tsx`: Cmd/Ctrl+I runs the offered action for a selection and ignores an empty selection.

## Out of scope

- Adding a visible shortcut label to the context menu.
- Changing any existing keyboard bindings.
