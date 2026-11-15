# Reveal target and blocked state

**Complexity: 5/10** — ~65 added lines, 2 files, 6 requirements, 15 test scenarios, 3 new units (p=5.39), driven by the seven root-rule boundary cases and a projection that must stay derived.

## Goal

Add the two server-side facts the editor button depends on. The first is the pure rule that turns an edited file's absolute path into a file-navigator root and a tree-relative file path. The second is the disabled-state projection that tells the client whether the file can be revealed at all. Neither the RPC nor any client rendering is part of this subplan.

## Design decisions and dependencies

This subplan depends on nothing earlier. It is the first of the source plan's server pieces and creates the module `src/file-navigator/reveal-editor.ts`, which `03-local-reveal`, `04-remote-reveal`, `06-focus-hint-and-held-selection`, and `07-reveal-applied-acknowledgement` extend. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; it is moved there unchanged when this decomposition finishes. Everything here must land before those subplans, because `03` calls both functions and `05-reveal-rpc` only exposes the reveal they enable. The three edits below are one change: the `EditorView` member is unresolved without the type edit, and the `view.ts` import is unresolved without the module, so any partial landing fails typecheck.

- The local target rule is one exported pure function, `revealTargetFor(file, { clone, root })`, returning `{ navigatorRoot, relPath }`. `file` and `root` are absolute — `file` is `tab.editor.path`, `root` is `Managers.tab.launchDir` (the `get launchDir` at `src/tab/manager.ts:37`, initialized as `projectDir ?? process.cwd()`) — and the second argument is an options object with both keys required, its `clone` a string or `undefined` and its `root` a string, so a caller cannot silently omit the root. It reads no filesystem, calls no manager, and never looks the clone up itself: the clone is the caller's answer. The rule is lexical — `path.relative` and `path.resolve` only, no `realpath` and no existence check — so a symlinked path is judged by the string the tab holds, which is also how `localCloneOf` judges it.
- The clone check runs first because the workspaces directory `$workspace` sits inside `$root`. When `clone` is defined, `navigatorRoot` is that clone. Otherwise a file strictly inside `root` roots at `root`, using `containedStrictly` from `src/path-containment.ts` — the same check `localCloneOf` uses at `src/plugins/origin-workspace-records.ts:63` (`if (!containedStrictly(base, resolved)) return undefined`). A file exactly equal to `root` is not strictly inside it, so it takes the own-directory fallback, which is harmless because an edited file is never a directory. The clone is trusted, not re-tested for containment: `localCloneOf` is its only producer, so a clone that does not hold the file is a caller bug and gets no branch here.
- Otherwise the file roots at its own directory, `path.dirname(file)`, with `relPath` equal to its basename. That makes the file a top-level row with nothing to expand, which is the source plan's rule for a file outside both a clone and the project root.
- `relPath` is `path.relative(navigatorRoot, file)` with POSIX separators (`split(path.sep).join(path.posix.sep)`), so it matches the navigator's row paths. It is never empty for a file, because the clone and root cases are strict and the fallback's root is the file's own directory.
- The clone is looked up by the caller, not inside this function, so the rule stays testable without an initialized workspaces directory. `localCloneOf` (`src/plugins/origin-workspace-records.ts:55`) answers `undefined` until the workspaces directory is initialized — `workspacePath('')` throws and the surrounding `try` catches it (`:57`–`:61`) — and it names `$workspace/<first segment>`, which is `$workspace/git-sync` for a GitHub-synced file (`SYNC_WORKSPACE_NAME` in `src/git/sync.ts:11`). That is why the source plan needs no synced-file special case: a synced file takes this same rule unchanged.
- `editorRevealBlocked(editor: EditorView): EditorView['revealBlocked']` is the second exported function. Its parameter is the stored record `tab.editor` (typed `EditorView` at `src/tab/types.ts:366`), never the shortened view. Its return type is the union declared on the member below, so the new module declares no second literal union and the two cannot drift. It returns `'unsaved'` when `editor.newFile` is set, otherwise `'no-route'` when `isRemoteCacheFile(editor.path)` holds and `remoteFileFor(editor.path)` finds no record, otherwise `undefined`. `'unsaved'` wins when both hold, which is the source plan's order; the two checks are the same pair `saveFile` uses to refuse an orphaned remote save (`src/editor/save.ts:33`–`:34`, `const remote = remoteFileFor(filePath)` then `if (!remote && isRemoteCacheFile(filePath))`). `isRemoteCacheFile` answers `false` until `initRemoteFileCache` has run (`src/file-navigator/remote/file-cache.ts:68`–`:70`), so a test for `'no-route'` that forgets to initialize the cache silently asserts `undefined`.
- `EditorView` (`src/tab/types.ts:131`) gains an optional `revealBlocked?: 'unsaved' | 'no-route'` member, placed after `branch` (the type's last field) and nowhere else. Its comment says it is projection-only: the server never stores it on the tab record and `buildTabView` sets it on every broadcast. `src/protocol.ts:17` already re-exports `EditorView`, and `web/src/` imports that shared type throughout, so no client mirror is touched.
- `buildTabView` (`src/tab/view.ts:77`) calls the helper at the editor projection (`src/tab/view.ts:170`, the line beginning `editor: tab.editor ?`) with the absolute `tab.editor.path` before `shorten` runs, and spreads `revealBlocked` in only when the helper returns a reason, so an unblocked editor's payload stays byte-identical to today's. That is the only site in `src/` that builds an `EditorView` (a grep for `editor: tab.editor` finds only it), and both `buildTabViews` (`:14`) and the single-tab update (`buildManagedTabView`, `:27`) funnel through it, so there is no second projection to update. `view.ts` is 238 raw lines but 170 counted ones, so it keeps room under the 200-line `max-lines`; the logic stays in the new module and `view.ts` gains one import and one call.
- Computing it at view time is what keeps it from going stale when a remote navigator closes: the very next broadcast after the close reports `'no-route'`. A new file's flag clears on its first save, because `finishSave` (`src/editor/save.ts:71`) rebuilds the editor record with `newFile: false` in both of its branches (`:79` for the same path, `:84` after a renamed new file).
- No new state is stored anywhere. `Tab.editor` remains the only editor record, and `revealBlocked` never reaches it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Path-containment primitives | `src/path-containment.ts` (`containedStrictly`) | The strict project-root test, unchanged. |
| Workspace clone lookup | `src/plugins/origin-workspace-records.ts` (`localCloneOf`, line 55) | Called by the reveal caller in `03`; this subplan's function accepts its result. It answers `undefined` before the workspaces directory is initialized and names `$workspace/<first segment>`, `$workspace/git-sync` included. |
| Editor wire payload | `src/tab/types.ts` (`EditorView`, line 131), re-exported by `src/protocol.ts:17` | One optional member added; no mirrored type in `web/src/`. |
| Tab-view projection | `src/tab/view.ts` (`buildTabView`, line 77; editor projection line 170; `buildManagedTabView`, line 27) | One import and one conditional spread, at the single site both the snapshot and the single-tab update use. |
| Remote file cache predicates | `src/file-navigator/remote/file-cache.ts` (`isRemoteCacheFile` line 68, `remoteFileFor` line 50) | Reused unchanged; they are the only test for an orphaned remote copy. |
| Orphaned-save precedent | `src/editor/save.ts:33`–`:34` (`remoteFileFor` beside `isRemoteCacheFile`) | The same predicate pair, so the button and the save path cannot disagree about which cached copies have a route back. |
| Tab-view test harness | `src/tab/view.test.ts` (`buildTabView`, line 2) | New cases beside the existing ones. |

## Proposed changes

- Create `src/file-navigator/reveal-editor.ts`. It holds `revealTargetFor`, `editorRevealBlocked`, and their doc comments. Its imports are `node:path`, `containedStrictly` from `../path-containment.js`, `isRemoteCacheFile` and `remoteFileFor` from `./remote/file-cache.js`, and `import type { EditorView } from '../tab/types.js'`. The last one must be `import type`: that keeps the runtime graph one-way (`tab/view.ts` → this module) so no cycle forms with `src/tab/types.ts`. It must not import `Managers`, the tab manager, or any client module.
- Add `revealBlocked?: 'unsaved' | 'no-route'` to `EditorView` in `src/tab/types.ts`, after `branch`, with a comment saying it is a projection member that is never stored.
- In `src/tab/view.ts`, import `editorRevealBlocked` from `../file-navigator/reveal-editor.js` and compute the field once inside the editor branch of `buildTabView`'s returned object at `:170`, passing the absolute `tab.editor.path` into the helper and spreading the result only when it is defined.
- Keep the new module as one file under the 200-line `max-lines` count. It starts near 55 raw lines, reaches about 110 after `03-local-reveal`, and about 150 after `07`, so no split is planned here. Only if the counted size passes 200 do `revealEditorFile` and `clearRevealFocus` move to a sibling module in the same directory, leaving both pure rules in this one — extract per `ai/guidelines/code-guidelines.md`, never compact.

## Tests

In a new `src/file-navigator/reveal-editor.test.ts`:

- `revealTargetFor` with a clone: a file under the git-sync clone roots at `$workspace/git-sync`, and a file under an agent workspace clone roots at that clone, with `relPath` relative to the clone. A clone that is also inside the project root still wins, proving the order.
- `revealTargetFor` without a clone: a file directly under the project root and a nested file both root at the root, with POSIX `relPath` values such as `src/file-navigator/remote/file-cache.ts`.
- A file outside the root roots at its own directory with `relPath` equal to its basename.
- A sibling directory whose name begins with the root's name, `/repo-other/x` against `/repo`, does not count as inside and takes the own-directory fallback.
- `editorRevealBlocked`: a new file gives `unsaved`; a remote cache file with a live record gives `undefined`; one without a record gives `no-route`; an ordinary local file gives `undefined`. Build the record through the real cache helpers, never `vi.mock`: initialize the cache on a temp directory with `initRemoteFileCache`, then register a record with `materializeRemoteFile` using a stub `FileSystemPort`, exactly the `cachedFile` helper at `src/plugins/origin-workspace.test.ts:255`–`:264`; make it orphaned with `forgetRemoteFilesOf` (`src/file-navigator/remote/file-cache.ts:75`). The cache is module-level state, so give each case a fresh temp project directory, clear it afterwards, and use no `it.concurrent` in this file.
- Every test that needs a directory makes it with `mkdtempSync(path.join(tmpdir(), 'janus-reveal-editor-'))` and removes it afterwards — in `afterEach` as in `src/file-navigator/open.test.ts:10`–`:15`, or in `finally` as in `src/editor/save.test.ts:69`–`:71`.

In `src/tab/view.test.ts`, add cases beside the existing editor-projection cases (`:162` `never includes editorDraft in the TabView sent to clients`, `:580` `abbreviates the editor path using the given shorten callback`):

- An editor tab with `newFile: true` projects `revealBlocked: 'unsaved'`, and the shortened path is still applied.
- An ordinary editor tab does not carry the property at all, not `undefined` and not a null field: assert its absence with the `in` operator rather than checking for `undefined`.
- A cached remote path with no record projects `'no-route'` while `shorten` rewrites the path, which is what proves the helper is handed the absolute path. Initialize the cache the way the `reveal-editor` tests do.
- `buildTabViews` and the single-tab update agree, since both go through `buildManagedTabView` (`src/tab/view.ts:27`) and then `buildTabView`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project server src/file-navigator/reveal-editor.test.ts src/tab/view.test.ts` (the project name is `server`, from `vitest.config.ts:12`). Read the diff to confirm `src/tab/view.ts` gained only the import, the one helper call, and the conditional spread; that `src/tab/types.ts` gained only the member and its comment; that no new editor state was added to `Tab`; and that the new module imports no `node:fs`, so no existence check or real-path resolution sneaks in.

There is no manual end-to-end check at this stage: nothing calls the helper in production until `03-local-reveal`, and the user-visible check arrives with `13-end-to-end-verification`. Do not invent a temporary caller or a debug command to exercise it; the two test files are the verification. Nothing here changes an RPC payload shape, so no spec or docs file is updated by this subplan.

## Out of scope

- No RPC, no controller routing, and no client code. The helper's first production caller is `03-local-reveal`; `05-reveal-rpc` only exposes that over the wire.
- No reveal, no open or retarget, and no restore hint.
- No tooltip or accessible-name wording; that is `08`.
- No change to `saveFile`, the remote file cache, the record lifetime, or the `files` command.
- A cached file whose record is gone is reported, never recovered or reopened; the source plan leaves reopening to the user.
- A path directly under the workspaces directory but not inside a clone is not treated as a clone. The source rule equates the clone with the first segment `localCloneOf` returns, and this subplan does not add a filesystem check to the pure function.
