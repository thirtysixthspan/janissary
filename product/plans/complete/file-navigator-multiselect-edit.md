# Edit every selected file from the file navigator context menu

**Complexity: 3/10** — extend the existing Open with picker state to retain a contextual selection and dispatch the existing `edit` command for each selected path, with focused component coverage and a specification update.

## Goal

When a user right-clicks a row inside a multi-file selection, opens **Open with**, and chooses **Edit as text**, the navigator opens every selected file in the plain-text editor. Other picker choices continue to act only on the clicked row.

## Approach

Keep opener resolution on the server for the clicked row, where it already belongs. Pass the applicable selected paths into the client opener hook when the context-menu action is invoked. Its picker state retains those paths, and choosing the existing `edit` command sends one ordinary editor command for each path in selection order. The normal Open gesture and every non-edit picker choice retain their existing single-row behavior.

## Implementation steps

1. Extend `web/src/useFileNavigatorOpener.ts` so context-menu opening can retain the current applicable selection and dispatch the Edit choice to each selected path while preserving single-path commands for other choices.
2. In `web/src/FileNavigatorTab.tsx`, pass the selected operation paths to **Open with** only when the right-clicked row is part of the selection.
3. Add component coverage in `web/src/FileNavigatorTab.test.tsx` for opening multiple selected files through the context-menu **Edit as text** choice, alongside the existing single-row chooser test.
4. Update `product/specs/file-navigator-tab.md` to document this narrow multi-selection exception alongside Delete and plugin-contributed actions.

## Tests

- `web/src/FileNavigatorTab.test.tsx`: select two files, right-click a selected file, choose **Open with** then **Edit as text**, and assert one `edit` command is sent for each selected path in order.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec updates

- `product/specs/file-navigator-tab.md`: describe how **Edit as text** from the context-menu chooser acts on a selected group while other chooser choices remain per-row.

## Docs

- Check `help.md` and `documentation/user-documentation/` for a description of the context-menu chooser. Update an existing description only if it documents the changed behavior.

## Out of scope

- Opening multiple files through double-click, **Open**, or any picker choice other than **Edit as text**.
- Changing the server opener registry or its per-file resolution contract.
- Changing selection behavior, copy behavior, or plugin-contributed actions.
