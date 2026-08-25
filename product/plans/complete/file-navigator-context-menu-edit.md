# Add Edit to the file navigator menu

**Complexity: 3/10** — the navigator already has a direct `edit <absolute-path>` action and a pure context-menu model, so this is a small client wiring change with focused menu/integration tests plus spec and public-documentation updates.

## Goal

A file row's right-click menu must offer **Edit**. Activating it must run the same `edit <absolute-path>` command used elsewhere, opening ordinary files in the text editor and image files in the image plugin's editor. Directories and the `..` row must not offer Edit.

## Approach

Add an `edit` callback to `FileNavigatorMenuActions` and place its menu entry between **Open** and **Open with** for non-directory rows. Wire it to `FileNavigatorTab`'s existing direct `editFile` helper rather than the opener chooser: Edit is an explicit action, so it should work for unsupported and extensionless files as well as registered image types.

Keep the action bound to the right-clicked row, like Open and Rename. It does not act on a multi-selection and does not change selection.

## Implementation steps

1. Update `web/src/file-navigator-menu-items.ts` and `web/src/file-navigator-menu-items.test.ts` with the Edit action, its file-only visibility rule, its placement in the first group, and activation coverage. Wire it to the existing absolute-path `editFile` sender in `web/src/FileNavigatorTab.tsx`, and update the overlay test fixture and ordinary-entry assertion in `web/src/FileNavigatorOverlays.test.tsx`. Run `./scripts/run.mjs check-diff`.
2. Add `web/src/FileNavigatorTab.test.tsx` coverage proving the context menu sends `edit` for both an ordinary file and an image, while directory and `..` menus omit the entry. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/file-navigator-tab.md` with the nine-entry maximum, file-only Edit rule, right-clicked-row semantics, and image/text destinations. Update `documentation/user-documentation/tab-types/file-navigator.md` to document the row menu and correct its stale claim that Copy and Paste have no menu route. Run `./scripts/run.mjs check-diff`.
4. Promote this plan to complete and remove only the matching fixed entry from `product/backlog/issues.md`. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/file-navigator-menu-items.test.ts`: an ordinary file lists Open, Edit, and Open with in order; Edit invokes its callback with that row; directories and `..` omit Edit.
- `web/src/FileNavigatorOverlays.test.tsx`: the rendered ordinary row menu includes Edit.
- `web/src/FileNavigatorTab.test.tsx`: selecting Edit for a text/ordinary file sends `edit <absolute-path>`.
- `web/src/FileNavigatorTab.test.tsx`: selecting Edit for an image sends the same command, which the image opener owns, and non-file rows do not show Edit.

## Out of scope

- Adding a multi-selection edit operation.
- Changing Open, Open with, double-click, Shift+double-click, or keyboard behavior.
- Changing server-side `edit` dispatch; image and text destinations already resolve there.
- The separate PR 789 follow-up that replaces the image tab's text Edit control with an icon.

## Verification

`./scripts/run.mjs check-diff` must pass cleanly after each implementation step.
