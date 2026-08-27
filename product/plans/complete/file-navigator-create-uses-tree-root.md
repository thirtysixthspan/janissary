# File navigator creation uses the tree root

**Complexity: 3/10** — two pure command builders and their one call site. No protocol, server, or resolution changes; the corrected commands travel the same path the navigator's `edit`, `open`, and clipboard commands already take.

## Goal

Creating a new file or directory from the file navigator — the header buttons, the row context menu, or `Cmd+N` — must create it under the navigator's own tree root, whatever the active tab's working directory happens to be.

## Approach

Every other command the file navigator dispatches (`edit`, `open`, a plugin opener, the clipboard paths) prefixes the tree's absolute root, so the server receives an absolute target. New file and New directory alone send a tree-relative target, which the server resolves against the active tab's working directory instead. When that tab is a workspaced agent whose shell runs inside a clone, the new file lands in the clone and then fails to save.

Prefix the absolute root in the two command builders, matching the existing convention. The tree-relative path a new directory is expected to appear at stays relative, because it is matched against row paths client-side to trigger the auto-rename.

## Implementation steps

1. In `web/src/file-navigator/file-navigator-new-file.ts`, give `newFileCommand` and `newDirectoryCommand` the tree's absolute root and have them emit absolute targets. Leave `newDirectoryTargetPath` tree-relative and keep `newDirectoryCommand` built from it, so the pending-directory match is unaffected.
2. In `web/src/file-navigator/FileNavigatorTab.tsx`, pass `files.absoluteRoot` to both builders.
3. Update the affected tests and add coverage that a root differing from the active tab's working directory still wins.

## Tests

- `web/src/file-navigator/file-navigator-new-file.test.ts`: `newFileCommand` and `newDirectoryCommand` produce absolute targets at the tree root, inside a selected directory, and under a root that is not the process working directory; `newDirectoryTargetPath` stays tree-relative.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: clicking New file and New directory, and pressing `Cmd+N`/`Ctrl+N`, dispatch absolute targets rooted at `files.absoluteRoot`; a navigator rooted elsewhere dispatches under that root.
- Preserve the existing target-directory selection cases and the new-directory auto-rename case.

## Out of scope

- How the server resolves a relative target for other commands, or which tab a dispatched command runs in.
- Rerooting, drag-and-drop, paste, rename, and delete, which already send absolute paths.
- The next-free-name collision rules for `untitled.md` and `untitled`.
- The accepted limitation that a collision-renamed new directory is not auto-renamed.
