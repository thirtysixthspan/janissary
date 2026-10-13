# Refuse renaming or moving a shell transcript that is still being written

**Complexity: 3/10** — one new refusal reason, one extra predicate threaded into the editor-tab rename that both rename entry points already share, and one guard ahead of the file navigator's single-item move and rename. It reuses `ShellTranscriptManager.isWriting` from the save refusal unchanged. The spread is test fixtures that build a hand-rolled `Managers` and now need a `shellTranscript` stub.

**Open transcript** on a shell tab opens `tab.transcript` in an ordinary editor tab. Renaming that tab (`renameEditorTab` in `src/tab/rename-editor.ts`, reached from the tab strip through `renameTabOp` in `src/tab/rename.ts` and from the editor's metadata row through `renameEditorFile` in `src/editor/rename.ts`) renames the file on disk and retargets the editor. The file navigator's `move` and `rename` (`moveItem` and `renameItem` in `src/file-navigator/manager/mutations.ts`) rename it too. `ShellTranscriptWriter` keeps appending to the moved inode, but `tab.transcript` still names the old path, so **Open transcript** opens a missing file, and `isWriting` matches only the writer's original path, so a later save of the renamed tab passes the live-transcript refusal and replaces the file by rename, orphaning every later row.

## Goal

While a shell transcript's writer holds its file open, renaming its editor tab, or moving or renaming it in the file navigator, is refused before anything changes on disk. The editor-tab refusal reads `Could not rename <name> to <new>. A running shell is still writing this transcript; rename or move it after the shell exits.` and is posted to the notifications feed as a `file-operation` notice, the way the existing name-taken and path-separator refusals are. The navigator refusal is a failed result for the source path carrying the same reason, which the navigator reports the way it reports its other move and rename failures. Once the shell exits or its tab closes, the same file renames and moves normally.

## Approach

Options considered:

- **Follow the file after it moves** (update `tab.transcript` on rename and match `isWriting` by inode rather than path). This touches the writer's identity rule, the tab record, and every rename path's retarget step, and still leaves the file navigator's bulk and directory moves to chase. It is larger and its failure mode is quieter than a refusal.
- **Refuse in each caller** (`src/tab/rename.ts` and `src/editor/rename.ts` separately), as the backlog entry proposed. Both callers end in `renameEditorTab`, which already owns the refusal text and its `Could not rename … to ….` shape, so guarding there is one check instead of two and keeps the message format in one place.
- **Refuse inside `renameEditorTab` and ahead of the navigator's single-item move and rename** (chosen). `renameEditorTab` gains an `isWriting` predicate argument, checked in `refusalReason` after the name checks; `renameTabOp` passes it through, and its two production callers pass `managers.shellTranscript.isWriting`. The tab layer stays free of a manager import, matching how `replaceFile` and `rewatch` already arrive as callbacks. In the navigator, a `liveTranscriptRefusal` helper in `src/file-navigator/manager/item-operations.ts` resolves the source with `containedPath` for a local (non-remote) navigator and answers `failedOperation(relPath, LIVE_SHELL_TRANSCRIPT_REASON)` when `managers.shellTranscript.isWriting` says so; `moveItem` and `renameItem` in `mutations.ts` return it ahead of `moveOne`/`renameOne`. `src/file-navigator/filesystem.ts` stays free of manager imports.

The reason lives beside the other file-operation reasons in `src/file-navigator/file-operation-result.ts` as `LIVE_SHELL_TRANSCRIPT_REASON`, which `rename-editor.ts` already imports from.

**Delete is deliberately not covered.** Deleting a live transcript from the navigator is an explicit, confirmed request to discard the file: the result is visible (the file is gone, and **Open transcript** opens nothing) rather than the silent truncation this item fixes, and refusing it would block a user from clearing a large transcript while the shell runs. The writer keeps appending to the unlinked inode until the shell ends, which costs disk space but loses nothing the user wanted kept.

## Implementation steps

1. `src/file-navigator/file-operation-result.ts`: add `LIVE_SHELL_TRANSCRIPT_REASON`.
2. `src/tab/rename-editor.ts`: add an `isWriting: (filePath: string) => boolean` parameter to `renameEditorTab`, and refuse in `refusalReason` with the new reason when it answers true for the editor's current path.
3. `src/tab/rename.ts`: pass the predicate through `renameTabOp`; `src/tab/operations.ts` passes `port.managerServices.shellTranscript.isWriting`; `src/editor/rename.ts` passes `managers.shellTranscript.isWriting`.
4. `src/file-navigator/manager/item-operations.ts`: add `liveTranscriptRefusal(managers, state, relPath)`; `src/file-navigator/manager/mutations.ts`: return it ahead of `moveOne` in `moveItem` and `renameOne` in `renameItem`.
5. Give the hand-rolled `Managers` fixtures that reach these paths a `shellTranscript` stub.

## Tests

- `src/tab/rename-editor.test.ts`: a saved file whose path the predicate reports as written is refused with the reason, and the file, tab path, name and title are untouched; the same rename succeeds once the predicate answers false.
- `src/editor/rename.test.ts`: renaming a live transcript through `renameEditorFile` is refused, leaves the file in place, and posts the refusal as a `file-operation` notification.
- `src/file-navigator/manager.test.ts`: `move` and `rename` of a path the transcript manager reports as written answer a failed result carrying the reason, leave the file in place, and retarget no editor; once the manager stops reporting it, the same move and rename succeed.
- The existing live-transcript cases in `src/editor/save.test.ts` and the `isWriting` cases in `src/shell/transcript/manager.test.ts` keep passing unchanged.

## Specs and docs

- `product/specs/shell-tab.md` § Text transcript, "Saving from the editor": a few sentences saying renaming the transcript's editor tab, or renaming the file or dragging it on its own to another folder in a file navigator, is refused with the message above while its shell is running, that a navigator delete is not refused, and that the file renames and moves normally once the shell has exited or its tab has closed.
- `documentation/user-documentation/command-bar/shell.md` "Read a shell session's transcript": one sentence saying the transcript can't be renamed or moved while its shell is running.

## Out of scope

- **Bulk moves, cut-and-paste, undo/redo replays, and moving a folder that contains a live transcript** in the file navigator. Each would strand the transcript the same way, but each runs through the batch filesystem port with per-path results, and guarding them needs a containment check (a writer path under the moved source) rather than the exact-path `isWriting`. The transcript lives in `.janissary/shell-transcripts/`, where those operations are rare; they are left for a separate item.
- Delete, for the reason given above.
- The writer, `BoundedAppendFile`, and `tab.transcript` — unchanged.
