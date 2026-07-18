# Distinguish staged (green) and conflicted (red) files in the file navigator

**Complexity: 5/10** — the git-status plumbing from `git status` output through to the row list is
already correctly scoped per tree tab (each tab's own `root` is passed as `cwd`, so a workspace's
file navigator always reports the git repository containing *that* navigator's own path, not some
other tab's or the process's). The remaining gap is that the file navigator currently collapses
every git state — modified, staged, and untracked — into one undifferentiated yellow. This plan
adds the missing distinction: staged files render green, conflicted (unmerged) files render red,
everything else keeps the existing yellow.

## Goal

In the file navigator (`files` tab):

- A file whose changes are **staged** (added to the index) renders in green.
- A file with an unresolved **merge conflict** (unmerged path) renders in red.
- A file that is modified-but-unstaged or untracked keeps the existing yellow, as today.
- A directory row still renders in the color of the highest-priority state found among its
  descendants, where conflict outranks staged, which outranks plain-changed.
- Git-status scoping itself (which repository a given navigator's coloring reflects) is confirmed
  correct in the current code and requires no change — `changedPaths`/`currentBranch` already run
  with `cwd` set to the file tree tab's own `root`, recomputed on open, re-root, and filesystem
  watch events (`src/file-tree/git-refresh.ts`, `src/file-tree/manager.ts`).

## Approach

`git status --porcelain=v1` reports two status columns per entry, `XY`: `X` is the index (staged)
state, `Y` is the worktree state. Today `src/git-status.ts` throws both columns away and only
records *that* a path changed. Instead, classify each entry into one of three states and carry
that classification (rather than a bare boolean) all the way to the row's CSS class:

- **conflict** — an unmerged path: `XY` is one of `DD`, `AU`, `UD`, `UA`, `DU`, `AA`, `UU`.
- **staged** — `X` is not `' '`, `'?'`, or a conflict code — i.e. the index differs from `HEAD`
  (`M `, `A `, `D `, `R `, `C `, and partially-staged forms like `MM`). Staged takes priority over
  any unstaged change on the same file, matching the "staged files should show as green" ask.
- **changed** — everything else: an unstaged worktree modification (`' M'`, `' D'`) or an untracked
  file (`??`). This is today's existing yellow behavior, unchanged in meaning.

This priority order (conflict > staged > changed) is applied both when classifying a single porcelain
entry and when a directory row aggregates the states of its descendants.

## Implementation steps

1. **`src/git-status.ts`** — change `changedPaths(root)` to return `Map<string, GitFileStatus>`
   instead of `Set<string>`, where `GitFileStatus = 'changed' | 'staged' | 'conflict'` (exported
   type). Add a `classify(status: string): GitFileStatus` helper applying the rules above.
   `parsePorcelain` classifies each entry and records the path (and, for renames/copies, the
   original path) with that status in the map. Keep the existing `stripPrefix` behavior and the
   "never rejects, empty map on failure" contract unchanged. Update the file-level doc comment
   (lines 6-10, 35-40) to describe the three states instead of "all three treated identically."

2. **`src/types.ts`** — replace `FileTreeRow.changed?: boolean` with
   `FileTreeRow.gitStatus?: 'changed' | 'staged' | 'conflict'`, updating its doc comment to
   describe the three colors and that a directory row carries the highest-priority state among its
   descendants.

3. **`src/file-tree/index.ts`** — rename `markChanged(rows, changed: Set<string>)` to
   `markGitStatus(rows, statuses: Map<string, GitFileStatus>)`. For a file row, look up its own
   path in the map. For a directory row, scan for descendant entries (same `startsWith` prefix
   check as today) and take the highest-priority state found (conflict > staged > changed) instead
   of a boolean `some()`. Add a small local `PRIORITY` ordering (or reuse the `classify` module) to
   compare two states.

4. **`src/file-tree/rebuild.ts`** — update the one call site (`markChanged(...)` →
   `markGitStatus(...)`) and the `RebuildableState`/`state.changed` field usage to match the new
   type from `manager.ts` (see step 5).

5. **`src/file-tree/manager.ts`** — rename `FilesTabState.changed?: Set<string>` to
   `FilesTabState.gitStatuses?: Map<string, GitFileStatus>`, updating its doc comment and the two
   reset sites (`open`'s initial state, `reroot`'s clear).

6. **`src/file-tree/git-refresh.ts`** — update the destructured result name (`changed` →
   `gitStatuses`) and the field it writes onto `current`, matching the renamed field.

7. **`web/src/file-tree-row-class.ts`** — replace the `row.changed` check with
   `row.gitStatus`, producing `files-name--changed`, `files-name--staged`, or
   `files-name--conflict` (no modifier when `gitStatus` is undefined). Update the file's doc
   comment.

8. **`web/src/theme.css`** — add `.files-name--staged { color: var(--success); }` and
   `.files-name--conflict { color: var(--error); }` alongside the existing
   `.files-name--changed { color: var(--running); }` rule (all themes already define `--success`
   and `--error` custom properties, so no new theme colors are needed).

## Tests

- **`src/git-status.test.ts`** — extend `changedPaths` (still exported under that name, now
  Map-returning) coverage: a modified tracked file classifies as `'changed'`; a staged-only file
  classifies as `'staged'`; an untracked file classifies as `'changed'`; a partially-staged file
  (staged content, then further unstaged edits — `MM`) classifies as `'staged'`; an unmerged
  (conflicted) path from a merge conflict classifies as `'conflict'`; the existing rename and
  subtree-prefix tests are updated to assert on map values instead of set membership.
- **`src/file-tree/index.test.ts`** (existing file, extend `markGitStatus` coverage) — a file row
  takes its own path's status; a directory row takes the highest-priority state among descendants
  (e.g. a conflict two levels deep outranks a staged file at the same level); a directory with no
  matching descendant is left unmarked.
- **`web/src/file-tree-row-class.test.ts`** — extend: `gitStatus: 'staged'` produces
  `files-name--staged`; `gitStatus: 'conflict'` produces `files-name--conflict`; `gitStatus:
  'changed'` still produces `files-name--changed`; no `gitStatus` produces neither modifier.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual (not run in this environment): open a `files` tab on a repo, stage a file (green),
  leave another modified but unstaged (yellow), and induce a merge conflict (red); confirm each
  renders in its respective color and that ancestor directories pick up the highest-priority
  descendant color.

## Out of scope

- Any change to how the git repository root is resolved relative to a file tree tab's root — this
  was investigated and found already correct (`cwd: root` plus the `--show-prefix` subtree
  reconciliation in `git-status.ts`), so no fix is needed there.
- A fourth color or icon for untracked-vs-modified — the issue only asks to distinguish staged and
  conflicted from the existing catch-all; untracked and unstaged-modified stay merged under yellow.
- Renaming `changedPaths`/`currentBranch` themselves, or restructuring `git-refresh.ts`'s
  coalescing logic — only the value each carries changes, not the surrounding control flow.
