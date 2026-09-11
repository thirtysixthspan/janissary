# Creating a file or directory in the file navigator must not inject a command into any tab's transcript

**Complexity: 3/10** — client-side only, in two files under `web/src/file-navigator/`, plus test updates. No wire-protocol change: the tab-scoped `fileNavigatorCreateFile` / `fileNavigatorCreateDirectory` RPCs already exist and already serve the remote-tree path; this fix routes local creation through them too. No server change.

## The bug

Clicking **New file** / **New directory** (or the `Cmd+N`/`Ctrl+N` chord for New file) in a **local**
file navigator sends a generic `command` message — `newfile <abs-path>` / `newdir <abs-path>`. The
server dispatches that through `CommandManager.dispatch` (`src/command/manager.ts:36`), which records
the text into the currently active tab's command history and runs it against whatever tab is
focused — not the file navigator, which has no transcript. The entry lands in some *other* tab's
transcript and even queues behind a busy agent, exactly the anti-pattern already fixed for file
open/edit in `product/plans/complete/file-navigator-open-no-command-injection.md`, which explicitly
named this as the remaining instance.

The correct route already exists: `fileNavigatorCreateFile` / `fileNavigatorCreateDirectory`
(`src/protocol/file-navigator.ts:106-107`) resolve the tab index to the navigator's own label and
root server-side and create the file/directory via `managers.fileNavigator.createFile`/`createDirectory`
→ `createNavigatorFile`/`createNavigatorDirectory` (`src/file-navigator/manager-files.ts:32-57`) — no
command message, no transcript injection, no queue. For a local root, `createNavigatorFile` already
opens the created file in edit mode directly (`openNavigatorFile(..., 'edit')`), matching what the
`newfile` command currently achieves. Remote trees already use both RPCs; local creation simply never
did.

## Goal

Creating a file or directory from the file navigator — button, context menu, or `Cmd+N`/`Ctrl+N` —
sends only `fileNavigatorCreateFile` / `fileNavigatorCreateDirectory` and injects nothing into any
tab's transcript, command history, or command queue, for local and remote trees alike.

## Approach

In `createFileNavigatorActions` (`web/src/file-navigator/file-navigator-menu-actions.ts`), drop the
`files.remote` branch in `createNewFile` and `createNewDirectory` so both always send the RPC with
`destination` set to the resolved target directory (`newFileTargetDir(...) ?? ''`), exactly as the
existing remote branch already does. This removes the last client-side use of `newFileCommand` and
`newDirectoryCommand` from `web/src/file-navigator/file-navigator-new-file.ts`; delete those two
functions and their now-unused `absoluteIn` helper, since nothing else calls them. `newFileTargetDir`
and `newDirectoryTargetPath` stay — both are still needed to compute `destination` and the
pending-new-dir guess.

## Implementation steps

1. **`web/src/file-navigator/file-navigator-menu-actions.ts`**
   - `createNewFile`: always `client.send({ method: 'fileNavigatorCreateFile', params: { index, destination } })`; drop the `files.remote` check and the `intents.sendCommand(text)` fallback.
   - `createNewDirectory`: always `client.send({ method: 'fileNavigatorCreateDirectory', params: { index, destination: targetDir ?? '' } })`; drop the `files.remote` check and the `intents.sendCommand(...)` fallback. Keep `setPendingNewDir(newDirectoryTargetPath(targetDir))` unconditional as it already is.
   - Update the import list to drop `newFileCommand`, `newDirectoryCommand`.
2. **`web/src/file-navigator/file-navigator-new-file.ts`** — delete `newFileCommand`, `newDirectoryCommand`, and the now-unused `absoluteIn` helper. Keep `findPendingNewDir`, `newFileTargetDir`, `newDirectoryTargetPath`.

## Tests

Mirror the existing style in `FileNavigatorTab.test.tsx` (mocked `JanusClient`, `fireEvent`,
`toHaveBeenCalledWith`). Update every assertion in the `new file` and `new directory` describe blocks
that expects a `command` message to expect `fileNavigatorCreateFile` / `fileNavigatorCreateDirectory`
with `destination`:

- directory-row-selected, file-row-selected, no-selection, and rooted-elsewhere cases for New file (4 tests),
- `Cmd+N` / `Ctrl+N` chord tests for New file (2 tests),
- directory-row-selected, file-row-selected, no-selection, and rooted-elsewhere cases for New directory (4 tests),
- **new regression test**: New file and New directory send no `command` message at all while a local navigator is focused.

In `web/src/file-navigator/file-navigator-new-file.test.ts`, delete the `newFileCommand` and
`newDirectoryCommand` describe blocks (their functions no longer exist); keep the `newFileTargetDir`,
`newDirectoryTargetPath`, and `findPendingNewDir` blocks unchanged.

`useFileNavigatorIntents.test.ts` passes unchanged (`sendCommand` remains for `openGithub`, which is
out of scope).

## Spec updates

`product/specs/file-navigator-tab.md`'s "Creating a new file" and "Creating a new directory" sections
already describe only observable behavior (target-directory rule, next-free-name behavior, opening a
fresh editor tab) with no mention of a command line or wire message — confirmed by reading both
sections in full. No spec change needed.

## Out of scope

- **`openGithub`** (header button) keeps its `open <url>` command — it intentionally opens a page tab through the command router.
- Server-side changes: none needed; `fileNavigatorCreateFile` / `fileNavigatorCreateDirectory` already behave correctly for local trees.
- The `newfile` / `newdir` command-bar commands themselves (`src/commands/new-file.ts`, `src/commands/new-directory.ts`) stay as legitimate standalone commands, documented in `help.md`; only the file navigator's use of them is buggy.
