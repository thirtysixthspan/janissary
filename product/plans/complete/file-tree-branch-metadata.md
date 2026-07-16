# Show the git branch in the file tree tab's metadata row

**Complexity: 3/10** — mirrors the existing `changedPaths`/`refreshGit` async-git pattern already
used for git-modified coloring; one new git-status function, one new field threaded through
existing plumbing, one small render addition.

## Goal

The file tree tab's header currently shows only the root path (`files.root`, rendered in
`.files-loc`). When the tree is rooted inside a git repository, the header should also show the
current branch, so the user can tell which branch a navigator is looking at without switching to
an agent tab. Format: `<path> <branch>`.

## Background

`src/git-status.ts` already exposes `changedPaths(root)`, an async, never-rejecting function that
shells out to git and resolves to an empty result when `root` isn't a git repository or the git
call fails. `src/file-tree-git-refresh.ts`'s `refreshGit` calls it off the event loop, coalescing
overlapping refresh requests, and writes the result onto `FilesTabState.changed` before triggering
a rebuild. `FileTreeManager.rebuild` copies tab state into the wire-facing `FileTreeView`
(`tab.files = { root, absoluteRoot, rows }`). The same trigger points that call `refreshGit` today
(open, reroot, and the debounced watcher-driven rebuild) are exactly the points a branch value
also needs refreshing — no new trigger points required.

## Approach

Add a second git query alongside `changedPaths`, following the same never-rejecting,
resolves-to-`undefined`-on-failure convention, and thread it through the same state → rebuild →
wire path `changed` already uses, ending in a new `.files-branch` span next to `.files-loc`.

## Implementation

1. **`src/git-status.ts`** — add `currentBranch(root: string): Promise<string | undefined>`,
   running `git rev-parse --abbrev-ref HEAD` in `root` via `execFileAsync`. Trims the output;
   returns `undefined` if the trimmed result is empty or the command fails (not a git repository,
   git missing, non-zero exit) — mirroring `changedPaths`'s never-rejects contract. A detached
   HEAD reports the literal string `HEAD`, which is git's own convention and is displayed as-is.

2. **`src/file-tree-manager.ts`** — `FilesTabState` gains `branch?: string`, declared next to
   `changed` with a comment mirroring `changed`'s ("Last-computed current branch name...").
   `rebuild()`'s `tab.files = { root: state.root, absoluteRoot: state.root, rows: ... }` gains
   `branch: state.branch`.

3. **`src/file-tree-git-refresh.ts`** — `refreshGit` fetches both `changedPaths(root)` and
   `currentBranch(root)` concurrently via `Promise.all`, writing both `current.changed` and
   `current.branch` under the same existing staleness/discard guard (tab still exists, root
   unchanged). The coalescing behavior (one in-flight refresh, at most one queued follow-up)
   already covers both values since they share the same trigger and guard.

4. **`src/types.ts`** — `FileTreeView` gains `branch?: string`, documented alongside `root` as
   "the current git branch, when the root sits inside a git repository."

5. **`web/src/FileTreeTab.tsx`** — inside the existing `.files-meta` div, add
   `{files.branch && <span className="files-branch">{files.branch}</span>}` as a sibling after
   the `.files-loc` span.

6. **`web/src/theme.css`** — add `.files-branch { font-size: 12px; color: var(--muted); }` near
   the existing `.files-loc` rule (`:557`).

## Tests

- **`src/git-status.test.ts`** — new `describe('currentBranch', ...)` block: returns the current
  branch name on a repo checked out to a named branch; returns `'HEAD'` for a detached-HEAD
  checkout; resolves to `undefined` for a directory that is not a git repository; resolves to
  `undefined` — never rejects — when the git invocation fails (nonexistent directory).
- **`src/file-tree-manager.test.ts`** — extend the existing `describe('git-modified coloring', ...)`
  block (or a new adjacent `describe('branch metadata', ...)`) with cases mirroring the existing
  `changedPaths` cases: branch appears on `tab.files.branch` once the async refresh resolves;
  reroot clears the previous branch value and triggers a fresh refresh; a refresh that resolves
  after the tab closed is discarded; a refresh whose root changed before it resolved is discarded.
  Requires a `currentBranchMock` alongside the existing `changedPathsMock`, wired into the same
  `vi.mock('./git-status.js', ...)` call.
- **`web/src/FileTreeTab.test.tsx`** — a case asserting `files.branch` renders inside
  `.files-branch`; a case asserting no `.files-branch` element is present when `files.branch` is
  `undefined`.

## Out of scope

- Any UI for switching or creating branches from the file tree tab — display only.
- Showing branch state (ahead/behind, dirty) beyond the name itself.
- Any other tab kind's metadata row (agent/harness/shell tabs) — this is scoped to the file tree
  tab's own header, per the issue text.
- The tab strip's own name/label (`navigator`) — unaffected, this is the tab's header only.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open `files` inside a git repository on a named branch and confirm the header shows
  `<path> <branch>`; check out a detached commit and confirm it shows `HEAD`; open `files` rooted
  outside any git repository and confirm only the path shows, no trailing branch text.
