# Remote file-cache owner identity

Complexity: 7/10

## Goal

Keep cached remote files and their write-back records isolated to the remote entry that owns them. Ending one entry must not remove another entry's cache, even when their host and workspace label match.

## Approach

Represent a cache owner with the full SSH destination, resolved remote workspace root, and canonical workspace label. Encode these fields unambiguously before deriving the owner directory, while continuing to hash the absolute remote file path inside that namespace so navigator roots that reach the same file share a cache file. Use the same owner value for materialization and cleanup.

Obtain the destination and resolved workspace from the owning `RemoteEntry`. A remote navigator uses its owner label to find that entry; plugin materialization uses its tab's entry. If an entry has no resolved workspace, it owns no cache and teardown does not clear a namespace.

## Implementation steps

1. Add a typed cache-owner identity and derive a collision-safe owner directory from all three fields.
2. Pass the owning entry identity into navigator and plugin cache materialization.
3. Clear only the ended entry's namespace, and skip cleanup when it never resolved a workspace.
4. Add regression tests for same-host/same-label distinct roots and same-host/path distinct SSH destinations, including write-back-port and independent cleanup assertions.
5. Update the remote file-navigator spec to describe cache sharing and owner isolation.

## Tests

- `src/file-navigator/remote/file-cache.test.ts`: same-label project roots stay isolated; separate SSH destinations sharing a host and absolute remote path write back to their original ports; clearing one owner preserves the other's cache file and record; unresolved entries clear nothing.
- Run `./scripts/run.mjs check-diff` after each implementation and test step.

## Out of scope

- Changing remote file write-back behavior or cache lifetime while an owning navigator remains open.
- Changing how remote workspace labels are displayed or persisted.
- Updating help or user documentation, since cache ownership is not user-facing behavior.
