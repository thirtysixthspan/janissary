# File navigator: color git-modified files yellow

## Summary

In the file tree tab (`files [path]`), any row that git considers changed — a working-tree modification, a staged change, or an untracked (new) file — renders its name in yellow, the same way a conventional editor's Explorer/SCM decoration highlights dirty files. A directory row also renders yellow whenever any file beneath it (at any depth, expanded or not) has a git change, so the signal is visible without expanding every folder. Rows in a directory that is not part of a git repository (or where git status cannot be determined) render with no special coloring and no error is shown.

## Design decisions

1. **Which git states count.** Modified (tracked, unstaged), staged, and untracked files are all treated identically — all render in the same yellow, with no visual distinction between the three states. This matches the literal ask ("indicate modified files as indicated by git") without introducing a broader status-coloring language than requested.
2. **Directory propagation.** A directory row is colored yellow if any descendant file anywhere under it has a git change, regardless of whether that descendant's parent directories are currently expanded. This lets a user spot changes in collapsed subtrees without walking the whole tree, mirroring how IDEs decorate folders.
3. **Refresh trigger.** Git status is not polled on its own timer. It is recomputed on the same debounced refresh that already recomputes the tree's rows in response to filesystem-watcher events, so there is exactly one place that decides "the tree's displayed state is stale" and one place that refreshes it.
4. **Non-git roots.** If the tree's root is not inside a git repository, or the git status command fails for any reason, the tree renders exactly as it does today — no yellow anywhere, no error, no header notice. This keeps the feature purely additive for repos and inert everywhere else.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| Row build + flattening | `src/file-tree.ts` (`buildRows`) | Where per-row data (`FileTreeRow`) is assembled server-side; the natural place to attach a git-changed flag per row. |
| Row/view types | `src/types.ts` (`FileTreeRow`, `FileTreeView`) | `FileTreeRow` needs a new optional field for "this path (or, for a directory, something beneath it) has a git change." |
| Tree manager / watcher-driven refresh | `src/file-tree-manager.ts` | Owns the debounced watcher refresh that already recomputes rows on filesystem change — the new git-status recomputation attaches here, not to a new timer. |
| Row rendering | `web/src/FileTreeTab.tsx` | Renders each row's `files-name` span; needs to add a modifier class read from the new row field. |
| Default excludes | `src/file-tree.ts` (`EXCLUDES`) | `.git` is already excluded from the displayed tree, so nothing needs updating there — the tree already assumes a git-aware environment. |

No existing code in `src/` or `web/src/` invokes `git status` or parses its output — grepped for `git status`, `git diff`, `simple-git`, `execFile.*git`, `gitStatus`, none found. This is new integration surface, not an extension of an existing one.

## Proposed changes

1. **Server: git status lookup.** Add a small module (e.g. `src/git-status.ts`) exposing a function that, given an absolute directory root, runs `git status --porcelain` (or equivalent) scoped to that root and returns the set of repo-relative paths that are modified, staged, or untracked — or an empty set if the root isn't inside a git repository or the command fails. Failures (non-git directory, git not installed, non-zero exit) are caught and treated as "no changed paths," never surfaced to the caller as an error.
2. **Server: attaching the flag to rows.** In the tree manager's row-recomputation path (the same function invoked by the debounced watcher refresh), call the new git-status lookup once per refresh for the tree's root, then mark each `FileTreeRow` whose `path` is in the changed set, and separately mark every ancestor directory row of a changed path. This produces a `changed?: boolean` (or similarly named) field on `FileTreeRow` meaning "this row itself, or something beneath it, has a git change."
3. **Shared type.** Extend `FileTreeRow` in `src/types.ts` with the new optional boolean field, documented the same way its existing fields are (a one-line comment on what "changed" means for a directory vs. a file row).
4. **Client: rendering.** In `web/src/FileTreeTab.tsx`, add a modifier class (e.g. `files-name--changed`) to a row's `files-name` span when its `changed` field is set, and add the corresponding yellow color rule in `web/src/theme.css` alongside the file tree's other row styling, consistent with the existing theme's token conventions (light/dark aware, matching how other status colors are already defined in the theme).
5. **Spec update.** `product/specs/file-tree-tab.md`'s "Tree contents" section gains a short paragraph describing the git-modified coloring behavior (per the design decisions above), so the spec stays the source of truth for tree rendering rules.

## Tests

- `src/file-tree-manager.test.ts` (or a new `src/git-status.test.ts`): git-status lookup returns the expected changed-path set for a modified file, a staged file, and an untracked file in a real temp git repo; returns an empty set for a directory that is not a git repository; returns an empty set (not a thrown error) when the `git` binary invocation fails.
- `src/file-tree.test.ts` / `src/file-tree-manager.test.ts`: row-building marks a changed file's row, and marks every ancestor directory row up to the root, when a descendant file has a git change; unrelated rows are left unmarked.
- `web/src/FileTreeTab.test.tsx`: a row with `changed: true` renders with the `files-name--changed` class (or equivalent); a row without it does not.

## Out of scope

- Distinguishing modified/staged/untracked with different colors or icons — all three render identically per decision 1.
- Any polling mechanism independent of the existing watcher-driven refresh.
- Showing an error or notice when a root isn't a git repository.
- Any change to the delete/undo/redo/drag-and-drop behaviors already documented in `file-tree-tab.md`.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: open `files` on a git repo working directory with at least one modified tracked file, one untracked file, and one clean file in a nested, initially-collapsed subdirectory. Confirm the modified and untracked files render yellow, the ancestor directories (including the collapsed subdirectory) render yellow, and unrelated files/directories render with no coloring. Then open `files` on a directory that is not a git repository and confirm nothing renders yellow and no error appears.
