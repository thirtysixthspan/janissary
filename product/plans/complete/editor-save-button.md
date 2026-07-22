# Add an editor metadata save button

**Complexity: 3/10** — one existing save action exposed through a metadata button, matching CSS,
tests, functional spec, and the existing editor user guide.

## Goal

Replace the editor metadata dirty dot with a right-aligned save icon. The icon is enabled and
clickable when the buffer has unsaved changes and visibly dimmed and disabled when it is clean.

## Approach

Reuse the editor's existing imperative `save` function and dirty-state calculation. Add a semantic
button with the shared Font Awesome icon registry, keep the existing keyboard shortcut, and style
the control as a right-aligned metadata action.

## Implementation steps

1. Add a save icon registry entry and render a labeled, disabled-when-clean save button through a
   focused `EditorSaveButton` component so `EditorTab` remains within the file-size limit.
2. Add metadata-button styling and update editor tests to cover clean/dirty state and clicking the
   button.

## Tests

- Verify the save button starts disabled, becomes enabled after editing, and saves the current
  buffer when clicked.
- Verify a successful save returns the button to its disabled state.

## Spec updates

- Update `product/specs/editor-tab.md` to describe the metadata save button and its enabled state.

## Docs

- Update `documentation/user-documentation/tab-types/editor.md` to replace the dirty-dot and
  keyboard-only save description with the save button behavior while retaining the keyboard
  shortcut.

## Out of scope

- Save semantics, conflict handling, keyboard shortcuts, or close-confirmation behavior.
- The other backlog issues.
