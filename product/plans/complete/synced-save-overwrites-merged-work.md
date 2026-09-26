# Synced save overwrites merged work

**Complexity: 6/10** — the fix threads a new optional field through the `saveFile` RPC (protocol, validator, handler, adapter, client socket, editor hook) and touches the git-sync save cycle, the open and resync paths, and the save-cycle error reporting. Each change is small and follows an existing pattern, but they span server, client, and shared code, and the regression needs real git repositories rather than the mocked `child_process` the existing sync tests use.

## Bug

A git-synced editor tab silently deleted merged work when it saved: commit `dd632561` ("sync: documentation.md") removed 116 lines from `product/backlog/documentation.md` that its own parent already contained, in a clean fast-forward, with no conflict, error, or notification.

## Root cause

Four gaps line up:

1. `src/editor/save.ts` writes the buffer with `atomicWriteFile(targetPath, content)` and never compares it with what is on disk. Nothing records what the buffer was loaded from, so the save has no way to tell that the file moved on underneath it. This is the gap that turns a missed change into lost data.
2. Nothing tells an open synced tab that a git-sync pull rewrote its file. `src/git/` never calls `editorWatch.refresh`; the only call site is the manual resync in `src/editor/resync.ts`, and that refreshes only the resyncing tab. Every other pull (opening another synced file, another tab's save cycle) relies on an `fs.watch` event that the watch manager's own comment says a git-driven replace can silently miss. So the tab's buffer stayed at 12 lines while the disk held 129, and the overwrite prompt never appeared.
3. `commitIfChanged` in `src/git/sync.ts` runs a repo-wide `git add -A` with no pathspec, so a save can commit any other change sitting in the shared clone, not only the file that was saved.
4. A failed save-cycle sync only flips the tab's `sync` field to `error`. It posts no notification, although the spec says sync errors are "reported through the notifications tab" and the icon's tooltip says "see notifications".

The commit-before-pull ordering is not itself a cause. Once the buffer is known to match the disk, committing and then `pull --rebase` is git's own three-way merge of the local edit with upstream: non-overlapping edits merge, and overlapping ones fail the rebase, which already aborts and reports without discarding the local commit. The loss happened only because the committed content was a stale buffer written over newer disk content, and gap 1 closes that.

## Correct behavior

A save never replaces on-disk content the buffer has not seen. If the file changed on disk since the buffer was loaded, reloaded, or last saved, the write is refused and the user gets the existing "This file changed on disk. Overwrite it with your changes?" prompt. Choosing Overwrite writes anyway. A synced save commits only the saved file. Every git-sync pull (open, save cycle, manual resync) re-checks every open synced tab's file, so a clean tab reloads and a dirty tab gets the overwrite prompt on its next save. A failed save-cycle sync is reported in the notifications tab. This matches `product/specs/editor-tab.md` ("Live reload of external changes", "GitHub syncing") and `documentation/user-documentation/tab-types/editor-git-sync.md`, which already describe the refresh and the notification.

## Reproduction

`src/editor/save-synced-stale.test.ts` builds a bare `origin`, an `upstream` clone, and a `git-sync` clone used as the shared sync workspace through a real `GitSync`. It opens a synced editor tab on `product/backlog/documentation.md` whose buffer holds the 12-line seed, pushes a 129-line version from `upstream`, runs `openSync()` (another synced file opening) so the shared clone holds 129 lines, then saves the 12-line buffer plus one edit.

Observed on `master` before the fix: the save succeeded, and `origin`'s `master` went `seed → upstream records → sync: documentation.md`, with the file cut back to 13 lines, a clean fast-forward that removed the 117 upstream lines. A second case showed an untracked `stray.txt` in the shared clone committed alongside the saved file under `sync: documentation.md`.

## Approach

- **Save identity.** A shared pure module, `src/editor/save-conflict.ts`, exports `contentHash(text)` and `SAVE_CONFLICT_ERROR`. The client sends `expectedHash`, the hash of the text its buffer was last loaded from or saved as (`lastSaved`), with every ordinary save. Before writing, the server hashes the file on disk (leading BOM removed, matching what the browser's `response.text()` yields). On a mismatch it refreshes that tab's watcher and throws `SAVE_CONFLICT_ERROR`. The client recognises that exact error and opens the overwrite dialog instead of showing a save error. The dialog's Overwrite sends no `expectedHash`, so it writes unconditionally, as it does today. The check is skipped when the field is absent, on a new file's first save, for a missing file, and for remote-host files, whose local copy is a cache.
- **Scoped commit.** `saveSync` takes the saved file's path. `commitIfChanged` stages, checks, and commits with a `-- <path>` pathspec, and the commit subject is the file's basename as before. `pullRebase` gains `--autostash`, so a change the save did not commit (for example another synced tab's save still in flight) no longer blocks the pull. Previously `git add -A` swept such changes into the commit.
- **Refresh after every pull.** A new `refreshSyncedTabs(managers)` calls `editorWatch.refresh` for every open synced editor tab. It runs after the save cycle, after a successful open sync in `finishOpenSynced`, and in place of the single-tab refresh in `resyncEditorTab`.
- **Report save-cycle failures.** `syncAfterSave` posts a `file-operation` notification, `Could not sync <filename>: <git error>`, when the cycle returns an error.
- **Config comment.** Correct the `syncPaths` comment in `src/config.ts`, which says "Empty by default" while the default is `['product/backlog/', 'product/plans/']`.

## Implementation steps

1. Add `src/editor/save-conflict.ts` (`contentHash`, `SAVE_CONFLICT_ERROR`) with unit tests in `src/editor/save-conflict.test.ts`.
2. Add a new `src/editor/stale-save.ts` that reads the target file, compares its hash with the expected one, refreshes the tab's watcher on a mismatch, and throws `SAVE_CONFLICT_ERROR`. Call it from `saveFile` in `src/editor/save.ts`, which gains an optional `expectedHash` parameter.
3. Thread `expectedHash?: string` through `src/protocol/editor.ts`, `src/client-params/editor.ts`, `src/message/handler.ts`, and `src/controller/editor-adapter.ts`.
4. Client: `JanusClient.saveFile(url, content, expectedHash?)` in `web/src/ws.ts`. In `web/src/editor/useEditorFile.ts`, send `contentHash(lastSaved)` on a normal save, nothing on Overwrite, and open the conflict dialog on `SAVE_CONFLICT_ERROR`.
5. `src/git/sync.ts`: pathspec-scoped `commitIfChanged`, `saveSync(filePath)`, `--autostash` on `pullRebase`. `src/editor/save.ts` passes the tab's path.
6. Add `src/editor/refresh-synced.ts` (`refreshSyncedTabs`) and call it from `syncAfterSave`, `finishOpenSynced` in `src/open/file-manager.ts`, and `resyncEditorTab`.
7. `syncAfterSave` notifies on an error result.
8. Fix the `syncPaths` comment in `src/config.ts`.
9. Update the affected unit tests: `src/git/sync.test.ts` (pathspec, autostash, path argument), `src/editor/save.test.ts` (conflict refusal, force write, notification, refresh, path argument), `src/editor/resync.test.ts`, `web/src/editor/useEditorFile.test.ts`, and the `saveFile` param validator test if one pins the shape.

## Regression test

`src/editor/save-synced-stale.test.ts`:

- `refuses a stale buffer instead of committing it over upstream work the clone already pulled`: the reproduction above. It asserts that the save throws `SAVE_CONFLICT_ERROR`, the disk still holds the 129 upstream lines, and `origin` still holds them after the cycle would have run.
- `commits and pushes only the saved file when the buffer matches what is on disk`: a matching save reaches `origin`, the `sync: documentation.md` commit contains only that path, and an untracked `stray.txt` stays untracked.

Both fail on the current code: the first because the stale save is written and pushed, the second because `stray.txt` is committed.

## Specs and docs

- `product/specs/editor-tab.md`: under "Live reload of external changes", state that a save whose file changed on disk since the buffer last matched it shows the overwrite prompt even when the change was never observed. Under "GitHub syncing", state that the commit contains only the saved file and that a save-cycle failure posts a notification.
- `documentation/user-documentation/tab-types/editor.md`: the same save-time check in "When the file changes outside the editor".
- `documentation/user-documentation/tab-types/editor-git-sync.md`: the commit step names only the saved file.

## Out of scope

- Retrying a non-fast-forward push inside the save cycle. It still ends in the error state, now with a notification, and a manual resync followed by a save retries it.
- Notifications for open-sync and manual-resync failures, which the bug report does not name.
- Save-conflict detection for remote-host files.
- A merge view or diff in the overwrite dialog.
- Reordering the save cycle to pull before committing (see Root cause).
