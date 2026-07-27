# Clicking resync updates the editor content when the remote has changes

**Complexity: 3/10** — a root-cause fix confirmed by direct experiment; touches two existing files (`src/editor/watch-manager.ts`, `src/editor/resync.ts`) plus their tests, no new modules or protocol changes.

## Goal

Per the backlog: "clicking the resync button in the editor should update the editor content when the remote has changes." Clicking the sync icon on a `synced`/`error` editor tab calls `resyncEditorTab` (`src/editor/resync.ts`), which pulls the shared sync workspace up to date via `GitSync.openSync()` and updates the tab's `sync` status — but never reloads the buffer. Its own comment claims the on-disk change "is picked up by the existing file watcher exactly like an external edit," relying entirely on `EditorWatchManager`'s `fs.watch` on the file to notice the change and push a new `mtimeMs` to the client (which then re-fetches content via `useEditorWatchReload`, `web/src/editor/useEditorWatchReload.ts`).

## Root cause

Confirmed by direct experiment (`node` script in a throwaway git repo, in this environment): a single-file `fs.watch(filePath, ...)` reliably fires for the **first** git-driven replacement of that file (a `git pull`/`merge`/checkout-style rewrite), but a **second** such replacement is silently missed — no event fires at all. `GitSync.pullRebase` (`src/git-sync.ts:93-104`) performs exactly this kind of replace on every pull, whether via `git pull --rebase` or its `git reset --hard origin/master` fallback. The watcher established once, when the synced tab first opens (`src/open-file-manager.ts:114`, inside `finishOpenSynced`), survives that first pull but goes silently stale after any subsequent one — including the pull a resync click triggers. This is a general fs.watch limitation on this OS (FSEvents-backed), not a Janissary-specific race.

## Approach

Stop relying solely on the passive `fs.watch` callback for the resync path. After `resyncEditorTab`'s pull completes, explicitly re-check the file's mtime against the watcher's last-known baseline (the same comparison `EditorWatchManager`'s private `check()` already does) and, if it moved, push the new `mtimeMs` onto the tab immediately — then re-arm the watcher on the file's current state so the next external or sync-driven change starts from a fresh baseline instead of an inode `fs.watch` may have already stopped tracking.

Add one public method to `EditorWatchManager`: `refresh(label)`, which runs the existing check logic for that label and then calls the existing `watch()` again to re-establish a live watcher. `resyncEditorTab` calls it once the pull succeeds, before its final `messageBus.emit`.

## Implementation steps

1. In `src/editor/watch-manager.ts`, extract the existing private `check(label)` body into a reusable form and add a new public method:
   ```
   refresh(label: string): void
   ```
   It looks up the tab's current watch state; if none exists, it's a no-op (mirrors `check`'s and `markSaved`'s existing unknown-label handling). Otherwise it runs the same mtime-comparison-and-emit logic `check()` already performs, then calls `this.watch(label, state.filePath)` to re-arm a fresh watcher (recomputing the baseline from the file's current mtime, closing and replacing the prior — possibly stale — `fs.watch` handle, exactly as `watch()` already does when called a second time for the same label).
2. In `src/editor/resync.ts`, after the pull succeeds (the `!('error' in result)` branch) and the tab's `sync` field is updated to `'synced'`, call `managers.editorWatch.refresh(freshTab.label)` before the final `messageBus.emit('state', { type: 'dirty' })`. Skip the call in the error branch — nothing changed on disk to detect.

## Tests

Add to `src/editor/watch-manager.test.ts` (mirroring its existing `mkdtempSync`-based real-file setup, not mocks, since the fix's correctness hinges on real `fs.watch`/`statSync` interaction):

- `refresh detects a change since the last baseline and pushes the new mtimeMs onto the tab` — call `watch()`, then `writeFileSync` a change directly (bypassing the mocked `fs.watch` callback entirely), then call `refresh()`, and assert `tabs[0].editor?.mtimeMs` now equals the file's current mtime.
- `refresh re-arms the watcher, replacing the previous one` — call `watch()`, then `refresh()`, and assert `watchMock` was called a second time (mirroring the existing "watch replaces an existing watcher for the same label" test's assertion shape).
- `refresh does nothing for an unknown label` — mirrors the existing "does nothing for an unknown label" test.

Add to `src/editor/resync.test.ts` (mirroring its existing `setup()` helper):

- `resyncEditorTab calls editorWatch.refresh after a successful pull` — extend the `setup()` helper's `managers.editorWatch` mock with a `refresh: vi.fn()`, call `resyncEditorTab`, and assert `refresh` was called once with the tab's label.
- `resyncEditorTab does not call editorWatch.refresh when the pull errors` — same shape, using the existing "transitions sync to error" scenario's `openSync` rejection, asserting `refresh` was not called.

Run `./scripts/run.mjs check-diff` to confirm.

## Spec updates

- `product/specs/editor-tab.md:242-248` (the resync-click paragraph) — no wording change needed; the spec already describes the correct, now-actually-achieved behavior ("the fresh content loads automatically" when there are no unsaved edits). This fix makes the implementation match what was already documented.

## Docs

- Checked `help.md` — no mention of resync/sync icon behavior. No update needed.
- Checked `documentation/user-documentation/` — no page describes this behavior. No update needed.

## Out of scope

- Fixing the same underlying `fs.watch`-staleness for *other* synced tabs that share the workspace and are refreshed indirectly by another tab's save-triggered pull (`syncAfterSave` in `src/editor/save.ts`) — the backlog issue names only the resync button; that broader watcher-robustness question (e.g., re-arming every open synced tab's watcher after every pull, not just the one being resynced) is a larger, separate change.
- Any change to `GitSync`, `pullRebase`, or how conflicts are resolved.
- The sync status icon's appearance or animation — unaffected.
