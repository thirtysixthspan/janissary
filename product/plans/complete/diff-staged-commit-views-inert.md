# Staged and last-commit diff views do not open files

Issue: in the staged or last-commit view, a click or double-click should not open a file.

Complexity: 2/10

## Goal

The diff tab's change source button (see `diff-change-source-toggle.md`) added staged and last-commit views, but every open route still worked in them and opened the working-tree file, which may not match what the view shows. In those two views nothing opens a file: not a click on a file name, not a click on a binary file's name, not a double-click on a line, and not **Return** on the walked hunk. The all-changes view is unchanged.

## Approach

- Server (`src/plugins/diff/tab-state.ts`): `openFile` and `openMedia` do nothing unless the tab's source is `all`, so a stale or scripted `open` intent cannot open a file the view no longer offers.
- Client (`web/src/plugins/diff/DiffTab.tsx`): the tab is openable only when `payload.source` is `all`. When it is not, the body carries a `diff-inert` class, **Return** opens nothing, and every `FileEntry` gets `openable={false}`.
- Client (`web/src/plugins/diff/FileEntry.tsx`): a non-openable entry's name button is disabled, the same look a deleted file has, and its line double-clicks do nothing.
- CSS (`web/src/plugins/diff/diff.css`): lines and split cells inside `.diff-inert` show the default cursor and no hover highlight, so nothing looks clickable when it isn't.

## Tests

- `src/plugins/diff/activate.test.ts`: after switching to staged, the `open` and `open-media` intents open nothing; switching back to all opens again.
- `web/src/plugins/diff/DiffTab.test.tsx`: in the staged and last-commit views the file name is disabled and a click, a line double-click, and Return send no `open` or `open-media` intent; the all view still sends them.
- `web/src/plugins/diff/diff-styles.test.ts`: added and context rows inside `.diff-inert` show the default cursor.

## Out of scope

- Showing the staged or committed version of a file in an editor.
- Comments, the view-cycle control, the keyboard walk, and the layout toggle keep working in every view.

## Specs / docs

`product/specs/diff-tab.md`: the "Change source" subsection says opening is disabled in those views. `documentation/user-documentation/tab-types/diff-tab.md`: replace the sentence saying those views open the working copy, and qualify the "Open a changed file" paragraph. `documentation/user-documentation/tab-types/diff.md`: qualify its file-opening paragraph the same way.
