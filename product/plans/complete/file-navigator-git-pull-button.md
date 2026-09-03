# Git pull button in the file navigator metadata row

**Complexity: 5/10** — every ingredient already exists: the header-button component pattern
(`FileNavigatorGithubButton`), the indexed file-navigator RPC end-to-end path (protocol →
client-message contract → dispatcher → controller adapter → `FileNavigatorManager`), the git
`execFile` template (`git-status.ts`), and a guaranteed refresh pipeline (`refreshGit` + `rebuild`
+ `dirty` broadcast). The new work is one small RPC, one git-pull module, one button, and the
cache invalidation that makes the refresh honest.

## Goal

A file navigator tab whose tree is rooted inside a git repository (the condition under which the
header already shows the branch name) gains a **Pull from origin** button in its metadata row,
between the GitHub button and Search files. Clicking it runs `git pull` at the tree's own root on
the server, then refreshes the whole view: re-read rows from disk (a pull can change any watched
directory, and the debounced watchers must not be the only path a git-driven change arrives
through) and recompute branch/git-status metadata, exactly like any other refresh. A failed pull
is reported as one notifications-feed line and leaves the tree as it was. Remote trees get the
same button: the pull runs on the remote host inside the workspace, over the existing navigator
channel.

## Design decisions

**The pull goes through `FileSystemPort`, not around it.** `gitMetadata` is already a port method;
`pull` joins it so the manager never branches on local-vs-remote. `LocalFileSystemPort` runs
`git pull` with the server's own environment (the user's checkout, the user's own credential
helpers — the same thing running `git pull` in a terminal does; `GitSync`'s `GH_TOKEN` injection is
specific to its sandboxed shared clone). `RemoteFileSystemPort` sends a new `git-pull` filesystem
operation over the channel.

**The new remote operation bumps `REMOTE_PROTOCOL_VERSION` to 9.** The handshake exists precisely
because "a field one end fills in and the other is expected to honor is as much a contract as a new
frame type" — an old remote would refuse `git-pull` as an unknown operation, which is exactly the
"looks healthy while doing the wrong thing" failure the version check prevents. This follows the
per-change bump convention recorded in `src/remote/protocol.ts`'s version history.

**Refresh invalidates the whole cached listing, not just git metadata.** `writeRebuiltPayload`
builds rows from `state.listings`, which only a watcher firing invalidates. A pull that updates
tracked files would otherwise re-render stale rows with fresh git colors. On pull completion the
manager clears the filesystem cache (`clearFilesystemCache`), rebuilds, and refreshes git metadata
(`refreshGit` rebuilds again when the fresh statuses land) — the same "watcher fired, everything is
suspect" rule `scheduleRebuild` applies, applied deliberately instead of hoped for.

**Visibility matches the branch text; no busy state.** The button renders when `files.branch` is
present — the same data-driven quiet degradation as the GitHub button (absent outside a git repo,
and for a waiting tree with no metadata yet). Clicks are coalesced server-side with a per-tab
in-flight bit (the `gitRefreshing` pattern): a second click while one pull is still running is
ignored rather than spawning an overlapping `git pull` that would collide on git's own lockfiles.

**Fire-and-forget with feed-reported failure.** The RPC replies `ack` immediately; the outcome
surfaces through the state broadcast (new rows/branch) or, on failure, one `file-operation`
notifications line carrying git's own error text — the same surface every navigator operation
failure uses.

## Implementation

1. **`src/git-pull.ts`** (new): `pullRoot(root: string): Promise<void>` — `execFileAsync('git',
   ['pull'], { cwd: root })`, rejecting with the git error so the caller can report it. Mirrors
   `git-status.ts`'s shape minus the swallow-errors rule: a status query degrades quietly, a pull
   the user asked for must be able to fail loudly.

2. **`src/file-navigator/filesystem-port.ts`**: add `pull(root: string): Promise<void>` to the
   `FileSystemPort` interface (rejection-available group, alongside `readFile`). `LocalFileSystemPort`
   delegates to `pullRoot`.

3. **`src/file-navigator/remote-port.ts`**: `pull` sends `this.request('git-pull', {})` — no path
   arguments, nothing to contain, and the far side operates on its own workspace root.

4. **`src/remote/protocol.ts`**: add `'git-pull'` to `RemoteFilesystemOperation`; bump
   `REMOTE_PROTOCOL_VERSION` to 9 with a version-history comment.

5. **`src/remote/filesystem-operations.ts`**: add the `git-pull` entry to `READ_OPERATIONS` —
   `noArguments` validation, `run: (context) => context.filesystem.pull(context.root)`.

6. **`src/file-navigator/state.ts`**: add `pullInFlight?: boolean` to `FilesTabState`.

7. **`src/file-navigator/manager.ts`**: add `pull(label: string): void` — via `withFilesState`,
   ignore when `pullInFlight` is set, otherwise set it and run `state.filesystem.pull(root)`. On
   success: clear the in-flight bit, `clearFilesystemCache(state)`, `rebuild(label)`,
   `refreshGit(label)`. On failure: clear the in-flight bit and `notify(managers, 'file-operation',
   label, `Could not pull: ${errorText(error)}`)`. Guard the completion path against a closed or
   re-rooted tab like `refreshGit` does (the root is captured up front and the result only applied
   if the tab still exists).

8. **`src/protocol/file-navigator.ts`**: add `| { method: 'fileNavigatorPull'; params: { index: number } }`.

9. **`src/client-message.ts`**: `fileNavigatorPull: 'ack'`.

10. **`src/message-handler.ts`** / **`src/message-handler-file-navigator.ts`**: route the new method
    through the file-navigator dispatcher (`case 'fileNavigatorPull'`).

11. **`src/controller/file-navigator.ts`** + **`src/controller/file-navigator-adapter.ts`**:
    `fileNavigatorPull(managers, index)` resolves the label and delegates to
    `managers.fileNavigator.pull(label)`; add the adapter type entry and binding.

12. **`web/src/icons.ts`**: alias `faDownload as pullIcon`.

13. **`web/src/file-navigator/FileNavigatorPullButton.tsx`** (new): mirrors
    `FileNavigatorGithubButton` — `files-pull` class, "Pull from origin" title, `pullIcon`.

14. **`web/src/file-navigator/FileNavigatorHeader.tsx`**: optional `onPull` prop; render the button
    after the GitHub button when provided.

15. **`web/src/file-navigator/useFileNavigatorIntents.ts`**: `pull` sends
    `fileNavigatorPull` with the tab index.

16. **`web/src/file-navigator/FileNavigatorTab.tsx`**: pass
    `onPull={files.branch ? intents.pull : undefined}`.

17. **`web/src/theme.css`**: add `.files-pull` to the shared header-button selector and its hover rule.

## Tests

- **`src/git-pull.test.ts`** (new, mocking `node:child_process`'s `execFile` the way
  `git-sync.test.ts` does): runs `git pull` with `cwd` set to the root; rejects with git's error
  message on a non-zero exit.
- **`src/file-navigator/manager.test.ts`** (mock `../git-pull.js` like `../git-status.js`): a
  successful pull clears the listings cache (a re-root… a fresh read happens — assert via a
  second-rebuild or by checking `readDirectory` was re-invoked), rebuilds, and refreshes git
  metadata (branch payload updates); a rejected pull posts exactly one notifications-feed line and
  does not rebuild; a second `pull` while one is in flight is ignored; `pull` for an unknown label
  is a no-op.
- **`src/message-handler.test.ts`**: `routes fileNavigatorPull` — mirrors `routes
  fileNavigatorCollapseAll`, with `fileNavigatorPull: vi.fn()` added to the mock controller.
- **`src/controller/file-navigator.test.ts`**: `fileNavigatorPull` delegates with the resolved
  label; no-op for a missing tab.
- **`src/remote/filesystem-operations.test.ts`**: add `'git-pull'` to `ALL_OPERATIONS`, a
  `PATH_CASES` entry `['git-pull', {}, []]`, and an `INVALID_CASES` entry `['git-pull', { path:
  'src' }]`.
- **`src/file-navigator/remote-port.test.ts`**: `pull` sends a `git-pull` request and resolves when
  the reply arrives.
- **`web/src/file-navigator/FileNavigatorPullButton.test.tsx`** (new): click forwards through
  `onClick`.
- **`web/src/file-navigator/FileNavigatorHeader.test.tsx`**: pull button renders with `onPull` and
  is absent without it; joins the docked-header actions list.
- **`web/src/file-navigator/useFileNavigatorIntents.test.ts`**: `pull` sends
  `{ method: 'fileNavigatorPull', params: { index: 3 } }`.
- **`web/src/file-navigator/FileNavigatorTab.test.tsx`**: renders `.files-pull` when `branch` is
  set and not otherwise; clicking it sends `fileNavigatorPull` with the tab index.

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any conflict resolution on pull: `git pull` failing mid-merge leaves git's own state on disk and
  the failure is reported; the tree's conflict coloring already surfaces conflicted files.
- Pull progress indication, remotes other than the configured upstream, or fetching without merging.
- A `git push` counterpart button.
- `help.md` documents only the `files` command and keyboard chords, so it needs no change; the
  user-documentation page does document the header buttons, and gains a "Pulling the latest from
  origin" section beside its GitHub-button section.
