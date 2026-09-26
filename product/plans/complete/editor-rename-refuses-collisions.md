# Refuse an editor-tab rename that would replace a file or leave its folder

**Complexity: 3/10**: one small server module gains two checks and a return value, its two callers surface the refusal as a notification, plus tests and a spec paragraph. No wire change and no new architecture.

Renaming a file on disk has two implementations. The file navigator's `renameItem` in `src/file-navigator/filesystem.ts` refuses a name containing a path separator with `INVALID_NAME_REASON`, and POSIX `rename` never runs over an existing destination there without an explicit overwrite. The editor tab's copy, `renameEditorTab` in `src/tab/rename-editor.ts`, joins the typed name onto the file's directory and calls `renameSync` with no destination check and no name validation. Renaming an open `notes.md` tab to `README.md` in the same folder silently replaces the existing `README.md`, and a name like `../notes.md` moves the file out of its folder.

`renameEditorTab` is reached from two places: `renameTabOp` in `src/tab/rename.ts` (the tab-strip `renameTab` RPC and the `rename` command, through `renameTab` in `src/tab/operations.ts`), and `renameEditorFile` in `src/editor/rename.ts` (the metadata-row rename).

## Goal

An editor-tab rename whose name contains a path separator, or is `.` or `..`, is refused. A rename onto a name that already exists in the folder is refused too, unless that existing entry is the file being renamed (a case-only rename on a case-insensitive disk). This holds for a new file not yet saved as well, because its first save would otherwise write over the existing target. A refused rename leaves the tab, its path, and the file on disk untouched, and posts one `file-operation` notification saying why.

## Approach

1. **`src/file-navigator/file-operation-result.ts`** gains `NAME_TAKEN_REASON = 'The destination already exists; choose another name'`. It is the `EEXIST` wording without the overwrite hint, because an editor rename offers no overwrite.
2. **`src/tab/rename-editor.ts`**: `renameEditorTab` returns `string | undefined`, the full refusal text or nothing. Before touching anything it refuses:
   - a trimmed name containing `/` or `path.sep`, or equal to `.` or `..`, with `INVALID_NAME_REASON`;
   - a destination that exists (`lstatSync`, so a dangling symlink counts and a symlink is never followed) and is not the same directory entry as the source, with `NAME_TAKEN_REASON`. "Same entry" means the source also exists and both `lstat` results share `dev` and `ino`.

   The refusal text is `Could not rename <old> to <new>. <reason>.`, matching the navigator's `Could not rename …. <reason>.` feed lines.
3. **`src/tab/rename.ts`**: `renameTabOp` returns the refusal. On a refusal it emits `state:dirty` (so a client that already shows the typed label snaps back) and skips the persist.
4. **`src/tab/operations.ts`**: `renameTab` posts the refusal with `notify(port.managerServices, 'file-operation', label, text)`.
5. **`src/editor/rename.ts`**: `renameEditorFile` posts the refusal the same way, as the other editor errors in `src/editor/commit.ts` and `src/editor/save.ts` do, and returns without persisting.

### Rejected alternatives

- Comparing `realpathSync` of source and destination, as the backlog entry suggested. On macOS's case-insensitive disk the JavaScript `realpathSync` keeps the typed case, so a case-only rename (`notes.md` to `Notes.md`) would be refused even though no other file is involved. Comparing `dev` and `ino` from `lstat` recognizes that case correctly and does not follow a destination symlink.
- Appending the refusal to the tab's transcript for the tab-strip path, as the backlog entry suggested. An editor tab never shows its transcript, so the message would be invisible. The explicit `file-operation` notification always shows, whichever tab is focused.
- Delegating to the navigator's `renameItem`. It needs a navigator root to contain the path, and it would still call `renameSync` over an existing destination.

## Implementation steps

1. Add `NAME_TAKEN_REASON` to `src/file-navigator/file-operation-result.ts`.
2. Add the name and destination checks and the return value to `renameEditorTab`.
3. Return the refusal from `renameTabOp` and notify from `renameTab` in `src/tab/operations.ts`.
4. Notify from `renameEditorFile`.
5. Add the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/tab/rename-editor.test.ts` (new):
  - renaming a saved file onto an existing sibling is refused; both files keep their content and the tab keeps its path, name, and title;
  - renaming a not-yet-saved new file onto an existing sibling is refused the same way;
  - a name containing `/` is refused with the separator reason and the file stays in its folder;
  - `..` is refused with the separator reason;
  - a case-only rename of the file onto itself is not refused;
  - the unchanged happy path renames the file on disk, retargets the tab, and returns nothing;
  - a tab-strip rename through `TabManager.renameTab` that collides posts one `file-operation` notification with the refusal text (with `../notifications/index.js` mocked).
- `src/editor/rename.test.ts`: a metadata-row rename that collides posts the `file-operation` notification and leaves the tab and both files untouched.
- The existing "TabManager renameTab for editor tabs" cases in `src/tab/manager.test.ts` and the cases in `src/editor/rename.test.ts` stay unchanged and passing.

## Spec updates

- `product/specs/editor-tab.md`: the editor-tab rename paragraph gains the two refusals and the notification.
- `documentation/user-documentation/tab-types/editor.md`: "Renaming a tab renames the file" gains the same two refusals, since it already documents the rename.

## Out of scope

- The window between the existence check and `renameSync`: a file appearing in that instant could still be replaced. Closing it would need an exclusive rename primitive Node does not offer.
- Changing the navigator's rename or sharing one rename implementation between the two features.
- The `rename` command's own confirmation line, which describes agent-tab aliases; the command runs in the tab it was typed into, and editor tabs have no command bar.
