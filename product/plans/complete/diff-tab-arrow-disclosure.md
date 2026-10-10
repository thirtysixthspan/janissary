# Diff Tab Arrow Disclosure

Complexity: 4/10

## Goal

Make Left collapse the file at the current diff walk position and Right reveal its changes, then its full file on a second press.

## Approach

Use the walked hunk to identify the file and keep disclosure state local to the diff tab. Preserve the existing pointer controls and full-file context request. Right expands a collapsed file first, then requests full-file context; Left collapses the current file. Keep arrow handling on the diff body so buttons and comment editors retain their own keyboard behavior.

## Implementation steps

1. Add file disclosure actions to the diff walk and route Left/Right from the focused body to the selected file.
2. Add focused tests for collapsed-to-hunk expansion, full-file expansion, and collapse behavior.
3. Update the diff tab spec to describe the keyboard controls.

## Tests

- DiffTab tests for Left collapsing the selected file.
- DiffTab tests for Right revealing the changed hunk and a second Right requesting the full file.
- Run the diff-scoped check after each implementation step.

## Out of scope

- Changing pointer disclosure controls or the existing up/down and j/k navigation.
- Changing how Git context expansion is calculated or persisted.
