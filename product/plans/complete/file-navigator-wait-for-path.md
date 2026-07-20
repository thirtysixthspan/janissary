# File navigator polls for a not-yet-existing path instead of failing

**Complexity: 6/10** — no new tab type or RPC, and the row-building code already tolerates a missing directory, but this adds a genuinely new mechanism (interval-based polling plus a "waiting" tab state) across the server tab-open path and the client renderer, rather than reusing an existing pattern outright. It does closely mirror the harness tab's `provisioning`/`provisionError` placeholder-tab convention, which keeps the risk down.

## Goal

Today, `files <path>` (`src/file-tree/open-command.ts:33-35`) resolves the target, `statSync`s it, and if it's missing or not a directory, prints `files: <path>: not a directory` to the issuing tab's transcript and opens no tab at all. When the path is merely not-yet-created (e.g. a directory a running build or clone is about to produce), the user has no way to "get ahead" of it — they have to keep re-running `files <path>` until it exists. Instead, when the target path doesn't exist yet (as opposed to existing but not being a directory), open the file navigator tab immediately in a waiting state, poll for the directory's appearance, and populate the tree the moment it shows up — mirroring how a `-w` harness launch opens a `provisioning` placeholder tab and fills it in once the workspace clone resolves (`src/harness/manager.ts`'s `spawnTab`/`finishSpawn`).

## Approach

- **Distinguish "doesn't exist" from "exists but isn't a directory."** `open-command.ts`'s current `statSync` call already collapses both into one `undefined`/non-directory check. Split it: an `ENOENT`-style `statSync` throw (the `stat` catch already used) means "doesn't exist yet" → wait; a resolved stat that exists but fails `isDirectory()` keeps today's immediate `not a directory` error (that case cannot resolve itself by polling).
- **New `FileTreeView.waitingFor?: string` field** (`src/types.ts:134`), set to the absolute path being waited for. Present ⇒ the client shows the waiting message and (since `rows` is `[]` and stays that way while waiting) the row list is empty. Cleared once the directory appears and the tree is built for real. This mirrors `HarnessView.provisionError` — a plain optional field on the existing view type, no new discriminated status enum needed since `waitingFor`'s presence/absence is itself the discriminant.
- **New `src/file-tree/poll.ts` module** (sibling to `watch.ts`, same shape): `pollForDir(states, label, absDir, onReady)` starts a `setInterval` (reuse `DEBOUNCE_MS`-style constant, e.g. `POLL_INTERVAL_MS = 500`) that `statSync`s `absDir` each tick; once it resolves and `isDirectory()`, clears the interval and calls `onReady()`. A companion `stopPolling(state)` clears an in-flight timer (used on tab close). Follows `watch.ts`'s existing "narrow `WatchableState`-shaped port, swallow filesystem races" convention.
- **`FilesTabState` gets a `pollTimer?: ReturnType<typeof setInterval>` field** (`src/file-tree/manager.ts`'s `FilesTabState` type), parallel to the existing `debounce` field. `closeTab` clears it (parallel to the existing `if (state.debounce) clearTimeout(state.debounce)` line) so a tab closed while waiting stops polling.
- **`FileTreeManager` gains a `pollForCreation`/`onDirCreated` pair**, wired into `openFilesCommand` as a third callback (alongside the existing `watchDir`/`refreshGit` callbacks `open()` already passes through) — keeps `open-command.ts` free of any manager-internal state, matching how `watchDir`/`refreshGit` are already threaded in. `onDirCreated` builds real rows via the existing `buildRows`, sets the tab's `files` to the resolved view (no `waitingFor`), starts the normal `watchDir`, and refreshes git — the exact tail end of what `openFilesCommand` does today for the directory-exists case.
- **`openFilesCommand`'s missing-path branch** creates the tab immediately with `rows: []`, `waitingFor: root`, registers the `FilesTabState` (so `closeTab`/polling have something to key off), starts polling, and applies the dock argument if given — same shape as the existing success path, minus `watchDir`/`refreshGit` (nothing to watch or git-refresh yet) and with polling substituted in.
- **Client (`web/src/FileTreeTab.tsx`)**: when `files.waitingFor !== undefined`, render a banner ("Looking for `<path>`…") in the same position/style as `HarnessTab.tsx`'s `harness-exited`/`provisionError` banners — a new `.files-waiting` CSS class in `web/src/theme.css`, styled the same as `.harness-exited` (`padding`, `background: var(--bg-soft)`, `font-size`, `color: var(--faint)`, bottom border). The row list stays empty and renders as today (an empty `.files-rows` div) while waiting; no other client logic changes, since the server pushes a `state: dirty` update (existing `messageBus.emit`) once the directory appears and rows populate through the normal render path.
- **Scope: only the `files <path>` command path** (`open-command.ts`). The 📁-button path (`open.ts`'s `openOrRetarget`, opening a tab's own live cwd) keeps its current silent no-op on a missing directory — that cwd is virtually always a directory a running tab already has, unlike an explicitly typed target path, so waiting there is out of scope for this fix (see Out of scope).

## Implementation steps

1. Add `waitingFor?: string` to `FileTreeView` in `src/types.ts`.
2. Create `src/file-tree/poll.ts` with `pollForDir`/`stopPolling`, mirroring `watch.ts`'s structure and error-swallowing.
3. Add `pollTimer?: ReturnType<typeof setInterval>` to `FilesTabState` in `src/file-tree/manager.ts`; clear it in `closeTab`.
4. Add `private pollForCreation(label, absDir)` and `private onDirCreated(label, absDir)` methods to `FileTreeManager`, and pass `pollForCreation` as a new parameter into `openFilesCommand` from `open()`.
5. In `src/file-tree/open-command.ts`, split the `stat` check into "doesn't exist" (waiting path) vs. "exists but not a directory" (today's immediate error), and implement the waiting-tab-open branch.
6. In `web/src/FileTreeTab.tsx`, render the waiting banner when `files.waitingFor !== undefined`.
7. Add `.files-waiting` to `web/src/theme.css`, mirroring `.harness-exited`.
8. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/file-tree/manager.test.ts` (extend, following the existing fake-timer convention at lines 202-219):
  - `'opens a waiting tab for a not-yet-existing path instead of erroring'` — `files <missing-subdir-path>` on a path that doesn't exist yet opens a navigator tab with `files.waitingFor` set to the resolved absolute path and `files.rows` empty; no error is appended to the creator's transcript.
  - `'populates the tree and clears waitingFor once the directory is created'` — with fake timers: open on a missing path, then `mkdirSync` the directory, `vi.advanceTimersByTime(POLL_INTERVAL_MS)`, and assert `files.waitingFor` is now `undefined` and `files.rows` reflects the directory's contents, and a watcher was started (`watchMock` called).
  - `'stops polling when the waiting tab is closed'` — open on a missing path, call `closeTab`, advance fake timers, and assert no error/crash and (via a spy or the mocked `setInterval`/`clearInterval`) that the poll doesn't keep firing — or more simply, assert `mkdirSync`-then-advance after `closeTab` does not resurrect the tab/rows.
  - The existing `'errors into the creator transcript when the target is not a directory'` test (writes a **file**, not a missing path) stays unchanged — confirms the two cases are still distinguished correctly.
- `web/src/FileTreeTab.test.tsx` (extend, following the `makeFiles` helper convention): a case asserting that with `files.waitingFor` set, the component renders the "Looking for `<path>`…" banner text and an empty `.files-rows` list; a case asserting no banner renders when `waitingFor` is `undefined` (covered implicitly by all existing tests using the default `makeFiles()`, but add one explicit assertion for clarity).

## Spec updates

`product/specs/file-tree-tab.md` — find where `files <path>`'s current "not a directory" error is documented and add a paragraph describing that a target path that doesn't exist yet opens the navigator in a waiting state showing "Looking for `<path>`…", populating once the directory is created, instead of failing — and that a target path that exists but isn't a directory still fails immediately with today's error.

## Out of scope

- The 📁-button `openOrRetarget` path (`src/file-tree/open.ts`) keeps its current silent no-op on a missing cwd — not touched by this fix.
- Any change to `buildRows`/`readDirSorted` (`src/file-tree/index.ts`) — they already tolerate a missing directory by returning `[]`, and are called unchanged once the directory appears.
- A cap/timeout on how long polling continues if the directory never appears — polling runs until the tab is closed or the directory shows up, same open-endedness as the harness `provisioning` wait for a workspace clone that never resolves (no existing precedent for a timeout there either).
- Any change to `retarget()`'s (`open.ts`) or `reroot()`'s (`navigation.ts`) handling of a directory that disappears after a tab is already open and watching it — that's an existing, separate "directory vanished under a live tab" scenario, not "opening a path that doesn't exist yet."

## Verification

- Run `./scripts/run.mjs check-diff` after each change.
- Manual check: run `files ./not-yet-there` for a subdirectory that doesn't exist. Confirm a navigator tab opens showing "Looking for `<path>`…" with no rows and no error in the issuing tab's transcript. In another terminal, `mkdir` that directory (optionally add a file to it). Within ~500ms confirm the tab populates with the directory's contents and the waiting message disappears. Separately, run `files ./a-real-file.txt` (an existing non-directory) and confirm the immediate `not a directory` error still appears with no tab opened.
