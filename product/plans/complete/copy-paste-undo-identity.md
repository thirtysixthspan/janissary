# Protect changed copy destinations during undo

**Complexity: 8/10** — safe undo needs recursive filesystem identity snapshots, history and wire-contract updates, and conflict handling for local and remote replay. Proceeding under the user's complexity override.

## Goal

Prevent copy-paste undo from deleting a destination that has changed since the copy was made.

## Approach

Record a recursive destination identity for each successful copy, including node type, device/inode, symlink target, and file content. Carry that metadata in the paste pair through history and remote replay. Before copy undo, compare the current tree with the recorded identity and use the existing conflict workflow when they differ; explicit overwrite may proceed, while skip leaves the changed destination in place.

## Implementation steps

1. Add a bounded, deterministic recursive identity helper and capture it after each successful copy.
2. Carry optional identity through paste pairs and validate it in remote replay history, treating legacy entries without identity as conflicts when the destination still exists.
3. Add identity conflicts to replay preflight and preserve existing retry and partial-success behavior.
4. Test modified files, replaced files, nested directory changes, missing outputs, overwrite and skip policies, and remote mapping.

## Verification

Run `./scripts/run.mjs check-diff` after implementation changes.

## Completion

Copy paste pairs now carry a recursive content and inode identity. Copy undo raises the existing
conflict prompt when the destination changed or comes from legacy history without identity; skip
preserves it, and explicit overwrite permits removal. Redo refreshes the snapshot. Remote history
validates and preserves the optional identity. Tests cover edits, replacements, nested changes,
missing output, retry policies, and malformed wire metadata. `./scripts/run.mjs check-diff` passes.
