# Retarget open editors after file-navigator moves

**Complexity: 7/10** — mutation results must update editor paths across single, bulk, paste, and history operations, while preserving local-only behavior and live shell-transcript refusals.

## Goal

When a local file-navigator operation moves or renames a file or directory, every open editor for that path follows the move. Bulk mutations also refuse to move a live shell transcript, just as single-item move and rename already do.

## Approach

Add one `pathsMoved` helper beside the item operations. It accepts source/destination pairs produced by successful filesystem operations, rebases exact and descendant editor paths using `containedAbsolute`, and retargets them through the existing `TabManager.retargetEditorTab` API. Expand that API's matching from exact path to contained prefix. Invoke it for local rename, move, bulk move, cut-paste, and successful undo/redo replay. Copy-paste does not retarget because the original remains in place; remote paths remain out of scope.

Before bulk move, cut-paste, and history replay, run `liveTranscriptRefusal` for each relevant source path and stop before mutation if any source is being written. Keep existing conflict and result semantics intact.

## Implementation steps

1. Add the path-pair retarget helper and update `retargetEditorTab` to handle a directory prefix safely.
2. Integrate successful pairs at each local mutation/replay boundary and add per-source transcript preflight to bulk wrappers.
3. Add regression tests for exact and descendant editor paths, each mutation family, replay direction, and live transcript refusals.
4. Update the file-navigator behavior spec and remove this item from the technical-debt backlog.

## Tests

- Unit coverage for exact and nested path retargeting, including path-prefix siblings that must not match.
- Manager integration coverage for directory rename, single and bulk move, cut-paste, undo, redo, and bulk transcript refusal without disk mutation.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Retargeting editors for remote navigator operations.
- Detecting file moves made outside Janissary, such as shell commands or branch changes.
- Changing copy-paste semantics or editor save/watch failure behavior.
