# Keep the keyboard walk visible on a collapsed diff file

**Complexity: 2/10** — the keyboard walk already identifies the selected file, and the existing file and hunk styles already establish the accent border. The selection only disappears visually when the selected file is collapsed.

## Goal

Keep the selected file's left accent border visible when the keyboard walk reaches one of its hunks and that file is collapsed.

## Approach

Pass whether each file owns the selected hunk into `FileEntry`. Apply a selected-file class to the entry container and use the existing accent color for its left border. The hunk keeps its current border when expanded.

## Implementation steps

1. Pass selected-file state from `DiffTab` into `FileEntry`, and add the collapsed-entry border style.
2. Add a regression test that walks to a whole-file change, collapses it with the keyboard, and checks that its entry remains selected.
3. Update the diff-tab spec to describe the visible selection on a collapsed file.

## Tests

- `web/src/plugins/diff/DiffTab.test.tsx`: keyboard selection remains visible on a collapsed file, while its hunk is hidden.
- `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing keyboard navigation, collapse behavior, or selection rules.
- Changing the border on expanded hunks.
- Updating user documentation; this is a small visual detail not otherwise documented there.
