# Refuse an editor save over a shell transcript that is still being written

**Complexity: 3/10** — one narrow query on the transcript manager, one accessor on the writer, and one refusal in the editor's local save path, shaped like the two refusals already beside it. The only spread is three existing test fixtures that build a hand-rolled `Managers` and call `saveFile` on a local file, which must now supply the new manager.

**Open transcript** on a shell tab (`openTranscriptFileFor` in `src/controller/transcript.ts`) opens `tab.transcript` through `managers.openFile.edit`, an ordinary editable editor tab. Saving that tab goes through `saveFile` (`src/editor/save.ts`), which writes a local file with `atomicWriteFile` (`src/atomic-write.ts`): a temp file renamed over the original. `ShellTranscriptWriter` (`src/shell/transcript/writer.ts`) keeps appending through the single `BoundedAppendFile` stream (`src/bounded-append-file.ts`) it opened on the first output, so after the rename every later row goes to the orphaned inode and silently never reaches the file on disk. The stale-save hash check (`refuseStaleSave`) only refuses once a new row has landed since the editor loaded the file; a save made while the shell is idle at its prompt passes it, and the overwrite prompt's own write omits the hash altogether.

## Goal

A save of a shell transcript whose writer still holds its file open is refused before anything is written — with or without the stale-save hash, so the overwrite prompt's write is refused too — with a `file-operation` notification for the editor tab and a thrown error the editor shows as its save failure, reading `This shell transcript is still being written; copy it to another file to edit it.` The transcript file's bytes are untouched, and the writer keeps appending to the file the button opens. Once the shell exits or its tab closes, the same file saves normally.

## Approach

Options considered:

- **Open the transcript read-only.** `openFile.edit` has no read-only mode, and the editor has none to switch on; adding one is a cross-cutting client and protocol feature far larger than this fix.
- **Make the writer detect and recover from a replaced file** (compare the stream's inode with the path's and reopen). This changes `BoundedAppendFile`/the writer, needs a per-write `stat` or a watcher, and would silently append the shell's rows after the user's edited text, which is arguably worse than refusing.
- **Refuse the save while the writer is live** (chosen). It is the smallest change, keeps the writer and `BoundedAppendFile` untouched, and follows the existing refusal pattern in `saveFile` (`refuseOrphanedRemoteSave`: a `file-operation` notification for the tab, then a thrown error that the RPC layer turns into the editor's save-failure feedback). The refusal is keyed on the writer actually holding the file open — not on the `.janissary/shell-transcripts/` directory — so an old transcript from an exited shell can still be edited and saved deliberately.

Changes:

1. **`ShellTranscriptWriter.writingPath()`** — returns the transcript's path while its file stream is open (`file.isOpen() ? file.openedPath() : undefined`), and `undefined` before the first output, after a failure abandoned the file, and once the finishing path has closed it.
2. **`ShellTranscriptManager.isWriting(filePath)`** — true when any writer it holds reports that `writingPath()`, compared with `path.resolve` on both sides. This is a deliberate, documented exception to the transcript plan's "the manager exposes no path lookup": the tab record (`tab.transcript`) cannot say whether the writer is still alive, and it outlives the writer by design so the button keeps opening the file. A writer leaves the manager's entries on PTY exit, tab close, reinstall and shutdown, so the query answers false from then on.
3. **`saveFile`** — for a local (non-remote) file, before the stale-save check and before `atomicWriteFile`, refuse when `managers.shellTranscript.isWriting(filePath)`, via a `refuseLiveShellTranscriptSave` function shaped like `refuseOrphanedRemoteSave`, exporting the reason as `LIVE_SHELL_TRANSCRIPT_SAVE_REASON`. Placing it ahead of the stale check means a save that is also stale gets this clear message rather than the overwrite prompt, whose write would only be refused again.

Accepted gap: between a PTY exit (which drops the entry at once) and the writer's finishing path writing the cursor's unfinished row and closing the stream — a few milliseconds of xterm drain — a save would pass and that final row could reach the orphaned inode. A user cannot realistically save inside that window, and closing it would mean keeping finished writers in the manager until their close resolves.

## Implementation steps

1. `src/shell/transcript/writer.ts`: add `writingPath()`.
2. `src/shell/transcript/manager.ts`: add `isWriting(filePath)` with its exception comment.
3. `src/editor/save.ts`: add `LIVE_SHELL_TRANSCRIPT_SAVE_REASON`, `refuseLiveShellTranscriptSave`, and the check in `saveFile`.
4. Give the hand-rolled `Managers` fixtures that save a local file a `shellTranscript` stub (`src/editor/save.test.ts`, `src/editor/save-synced-stale.test.ts`, `src/editor/watch-manager.test.ts`).

## Tests

- `src/shell/transcript/manager.test.ts`: `isWriting` is true for an installed writer's opened path once output has opened it (also for an unnormalized spelling of the same path), false before any output, false for another path, false after the PTY exits, and false after the tab closes.
- `src/editor/save.test.ts`: a save of a path the transcript manager reports as being written is refused with the reason (with and without an expected hash, the latter being the overwrite prompt's write), notifies the tab with `file-operation`, and leaves the file's bytes untouched; a save that is also stale gets this reason rather than the stale-save conflict; and the same file saves once the manager stops reporting it (the existing cases cover ordinary paths with the stub answering false).
- The existing `src/controller/transcript.test.ts` and `src/shell/transcript/writer.test.ts` cases keep passing unchanged.

## Specs and docs

- `product/specs/shell-tab.md` § Text transcript: one paragraph saying a save from the editor over a transcript still being written is refused with the message above, and that the file saves normally once its shell has exited or its tab has closed.
- `documentation/user-documentation/command-bar/shell.md` "Read a shell session's transcript": one sentence saying the transcript can't be saved over while its shell is running.

## Out of scope

- The harness tab's **Open transcript** button has the same class of hazard: it opens the agent CLI's own session file (Claude's or Codex's JSONL, found by the transcript tailer) in the same editable editor, and a save replaces it by rename. An agent that keeps its file handle open (Codex's rollout writer) would then append to the orphaned inode, and the harness transcript tailer, which reads by path, would see the user's replacement. That file is written by an external process Janissary does not hold, so `isWriting` cannot answer for it; guarding it needs a different rule (for example refusing saves of a live tailer's file) and is left for a separate item.
- `BoundedAppendFile` and the writer's append behavior — unchanged.
- A read-only editor mode for transcripts.
