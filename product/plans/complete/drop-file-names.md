# Drag drops from the file navigator insert file names, not paths

## Issue

When dragging files from the file navigator to the editor or command bar, include only the
file name, not the full path.

## Complexity

3/10. One path-formatting module, one call-site file, tests, and one spec file. No new
architecture; the existing `basename` helper in `web/src/shared/rel-path.ts` already does the
name extraction.

## Goal

Dropping tree rows on the command bar or on an editor inserts each row's own file name
(`a.ts`, never `src/a.ts` or a cwd-relative path. Remote trees keep the
`<host>:<absolute-remote-path>` form, because a bare name cannot be resolved against the remote
host from the receiving side. Harness drops are out of scope and unchanged: a terminal needs a
real path to resolve the file.

## Approach

The drop text is computed in `web/src/file-navigator/file-navigator-relative-path.ts`, which
already owns all destination formatting (`joinCommandPaths`, `joinEditorPaths`,
`remoteNavigatorPath`). Add one new function there rather than changing `joinEditorPaths`,
which `file-navigator-copy.ts` also uses to put tree-relative paths (one per line, different
backlog item) on the system clipboard — collapsing copy behavior into file names would silently
break the copy feature.

## Implementation steps

1. In `file-navigator-relative-path.ts`, add `joinDropFileNames(absoluteRoot, sourcePaths,
   remoteHost?, separator)`: for a local tree, map each source path through `basename` and join
   with `separator`; for a remote host, keep `remoteNavigatorPath` and join with `separator`.
2. In `useFileNavigatorDrag.ts`, switch the command-bar and editor drop branches of `drop()` to
   `joinDropFileNames`, with `" "` for the command bar and `"\n"` for the editor. The harness
   branch keeps `joinCommandPaths`. `targetCwd` stays (harness still uses it).
3. Update the spec file (below) and run `./scripts/run.mjs check-diff` after each step.

## Tests

In `file-navigator-relative-path.test.ts`:

- joins bare names with spaces (command-bar separator)
- joins bare names with newlines (editor separator)
- keeps the host-qualified absolute form for a remote tree, in both separators
- produces nothing for an empty list

In `useFileNavigatorDrag.test.ts` (update existing expectations, then add one new case):

- command-bar drop of `src/notes.txt` inserts `notes.txt` (was `src/notes.txt`)
- editor drop of `src/notes.txt` inserts `notes.txt` (was `src/notes.txt`)
- multi-select command-bar drop inserts `notes.txt a.ts` (was `tree/notes.txt tree/src/a.ts`)
- new: multi-select editor drop inserts `notes.txt\na.ts` separated by newlines
- remote drops keep `devbox:/srv/project/src/a.ts` in both command bar and editor (already
  asserted; unchanged)

## Spec

`product/specs/file-navigator-tab.md`: rewrite the insert-format sentences in "Dragging a row
into the command bar" and "Dragging a row into an editor tab" to describe file names only,
keeping the remote form as-is. The harness section keeps its cwd-relative wording.

## Out of scope

- Harness-terminal drops (keep full relative paths; a terminal must resolve the file).
- The copy-to-clipboard text form (tree-relative paths, governed by a separate backlog item).
- The existing `relativeNavigatorPath`/`joinCommandPaths`/`joinEditorPaths` signatures — all
  still used after this change.
