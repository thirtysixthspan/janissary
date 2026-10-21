# Remote new file cannot be saved after naming it

Complexity: 3/10

## Root cause

A file created from a remote file navigator opens in an editor with its name session running. Renaming the editor's file moves the local cached copy to the new name, but the cache record that routes saves to the remote is keyed by the old path. The renamed path is inside the remote cache with no record, so `saveFile` treats it as orphaned and refuses with "its file navigator is closed".

## Correct behavior

Renaming a cached remote file renames the remote file too, and later saves write to the renamed remote file.

## Reproduction

`src/editor/rename-remote.test.ts`: create a file through `createNavigatorFile` on a remote state, rename it with `renameEditorFile`, then `saveFile`. Before the fix the save throws "Could not save remote file: its file navigator is closed. Reopen the file from the remote navigator to save it."

## Approach

- `retargetRemoteFileRecord` in `file-cache.ts` moves a record to the new local path with the renamed remote path.
- `retargetRemoteFile` in `src/editor/remote-rename.ts` retargets the record and sends the remote rename, notifying on refusal.
- `renameEditorTab` takes an optional `onRenamed` callback, passed by both rename entry points (`renameEditorFile` and the tab strip rename).

## Regression test

`src/editor/rename-remote.test.ts` — renamed new remote file saves to the renamed remote path.

## Verification

Live check not possible: creating a file from a remote navigator needs a joined remote workspace, which a scratch instance cannot provide.

## Out of scope

Rolling back the local rename when the remote refuses it.
