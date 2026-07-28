# Capture a synced editor tab's project-relative path, not its workspace-clone path

**Complexity: 3/10** — a single function (`writeEditorEntry` in `src/profile/save-entries.ts`) gets
one extra branch; no new architecture, no changes to the load/launch side at all.

## Goal

`profile save` currently writes an editor tab's *resolved on-disk path* into the `editors` array
via `abbreviatePath`. For an ordinary editor tab that's correct and already round-trips. For a
**synced** editor tab (one opened on a path covered by the app config's `syncPaths`, see
`product/specs/editor-tab.md` § GitHub syncing), the on-disk path lives inside the shared
`git-sync` workspace clone at `<root>/.janissary/workspace/git-sync/<relative>` — not under the
project root. `abbreviatePath` elides the `.janissary` segment for anything under the workspace
base dir, so it gets captured as `$root/workspace/git-sync/<relative>`.

On `profile launch`, `openProfileEditors` (`src/profile/editors.ts`) hands that captured `path`
straight to `OpenFileManager.edit()`, exactly as a hand-typed `edit <file>` command would.
`expandUserPath` (`src/paths.ts`) is *not* a full inverse of `abbreviatePath` — it does not
restore the elided `.janissary` segment — so `$root/workspace/git-sync/<relative>` expands to
`<root>/workspace/git-sync/<relative>`, a path that has never existed on disk (the real clone is
at `<root>/.janissary/workspace/git-sync/<relative>`). `edit()` also does not recognize this
resolved path as sync-eligible (`isSyncPath` matches project-relative source paths like
`product/backlog/issues.md`, not paths already inside the clone), so it falls through to opening a
plain, empty, unsaved editor buffer instead of provisioning/pulling the shared git-sync workspace.
This is the profiles.md-reported bug: "editor tabs launched from a profile currently open empty
files in a nonexistent workspace."

Fix: when `profile save` captures an editor tab whose file is synced (`tab.editor.sync` is set),
capture the *original project-relative source path* it was opened from (e.g.
`$root/product/backlog/issues.md`) instead of the resolved clone path. That's exactly the form
`OpenFileManager.edit()` already recognizes via `isSyncPath()` on reload — the same path a user
would hand-author in an `editors` entry to get a synced tab — so `profile launch` re-provisions
(or reuses) the shared git-sync workspace exactly as opening that file interactively would,
instead of ever needing `expandUserPath` to reconstruct an internal clone location.

## Design decisions

**Fix `profile save`, not `profile launch`.** The launch path (`openProfileEditors` →
`OpenFileManager.edit()`) already correctly detects and provisions a synced file when given its
project-relative source path — that's the same code path a typed `edit <file>` command uses, and
it's already covered by `open-file-manager`'s own tests. The bug is entirely in what `profile
save` chooses to write for a synced tab's `path`; fixing the write side means the existing,
already-correct read side needs no changes.

**Derive the source path from the workspace clone path, without depending on `workspace.ts`'s
module-level state.** `GitSync.workspaceFilePath(relative)` (`src/git-sync.ts`) computes a synced
tab's on-disk path as `path.join(workspacePath(SYNC_WORKSPACE_NAME), relative)`, and
`workspacePath` reads a module-level `workspaceBaseDir` set once by `initWorkspaceDir` at process
start — not available in `save-entries.ts`'s unit tests. `abbreviatePath` sidesteps this same
problem by computing the state dir directly from the `root` context it's given
(`path.join(root, '.janissary')`) rather than calling into `workspace.ts`. Mirror that: compute
`path.join(managers.tab.launchDir, '.janissary', 'workspace', SYNC_WORKSPACE_NAME)` locally in
`save-entries.ts` and take `editor.path` relative to it. `SYNC_WORKSPACE_NAME` is already exported
from `git-sync.ts` for exactly this kind of shared reference.

**Gate on `tab.editor.sync`, not on path matching.** `EditorView.sync` (`src/tab/types.ts`) is
"set only for a file whose project-relative path is config-listed for GitHub syncing" — already
the authoritative signal, computed once at open time. No need to re-run `isSyncedPath` against the
live config during save.

## Implementation

1. **`src/profile/save-entries.ts`**:
   - Import `path` from `'node:path'` and `SYNC_WORKSPACE_NAME` from `'../git-sync.js'`.
   - Add a small local helper:
     ```ts
     // A synced editor's on-disk path lives inside the shared git-sync workspace clone, not under
     // the project root, so abbreviatePath can't make it portable (see the plan's Design
     // decisions). Capture the project-relative source path instead — the same form OpenFileManager
     // .edit()'s isSyncPath check already recognizes on reload, so profile launch re-provisions the
     // shared workspace instead of opening a path inside a clone that may not exist yet.
     function syncedSourcePath(editor: NonNullable<Tab['editor']>, launchDir: string): string | undefined {
       if (!editor.sync) return undefined;
       const workspaceDir = path.join(launchDir, '.janissary', 'workspace', SYNC_WORKSPACE_NAME);
       const relative = path.relative(workspaceDir, editor.path).split(path.sep).join('/');
       return `$root/${relative}`;
     }
     ```
   - In `writeEditorEntry`, change the `path` field to:
     `syncedSourcePath(tab.editor, managers.tab.launchDir) ?? abbreviatePath(tab.editor.path, { root: managers.tab.launchDir })`.
2. **`profiles/multitasking.json`** — this checked-in profile is the concrete case the issue
   reports: its three `editors` entries author the resolved clone path
   (`$root/workspace/git-sync/product/backlog/<file>.md`) directly, presumably captured by a
   pre-fix `profile save`. Correct each to the project-relative source path
   (`$root/product/backlog/<file>.md`) so `profile launch multitasking` opens real, synced content
   instead of empty buffers even without anyone re-running `profile save`.

## Tests

- **`src/profile/save.test.ts`**:
  - New case: an editor tab with `editor.sync: 'synced'` and `editor.path` set to a path inside
    `<launchDir>/.janissary/workspace/git-sync/...` is captured with `path` equal to
    `$root/<the original project-relative path>`, not the raw clone path.
  - New case: an editor tab with `editor.sync: 'provisioning'` (still loading when saved) is
    captured the same way — the source path, not the resolved clone path.
  - Confirm the existing `'writes an editor entry path relative to the project root when it is
    under the root'` case (an ordinary, non-synced editor tab) is unaffected — still goes through
    `abbreviatePath`.

## Spec

- **`product/specs/profiles.md`** — in the `profile save` section's editor-tab-capture paragraph,
  add a sentence noting that a synced editor tab is captured by its original project-relative
  source path rather than its location inside the shared git-sync workspace clone, so relaunching
  re-triggers the same sync provisioning/pull instead of opening an empty buffer at a path that
  may not exist yet.

## Out of scope

- Making `expandUserPath` a true inverse of `abbreviatePath` for `.janissary`-elided paths in
  general (e.g. a hand-authored `cwd: "$root/workspace/<name>"` pointing at some other tab's
  workspace clone). That's a broader, riskier change to a shared path-expansion helper used by
  every profile field (`cwd`, editor `path`, file-navigator `path`), and no reported symptom
  currently depends on it — the harness `workspace: true` flag always provisions a *fresh* clone
  regardless of any authored `cwd`, so it never round-trips through the buggy expansion in the
  first place.
- Changing `OpenFileManager.edit()` or `isSyncPath()` — the load-time sync detection is already
  correct for project-relative source paths and needs no changes.
