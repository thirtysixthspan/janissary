# Return a remote file navigator to its workspace root

**Complexity: 2/10** — a containment check in remote tree navigation rejects the workspace root itself, with a focused regression test.

## Goal

Allow a remote file navigator opened below its workspace root to navigate back to that root without reporting an outside-workspace error.

## Approach

The navigation guard currently uses `containedPath`, which intentionally rejects an empty relative path because it is meant for child entries. Treat the normalized workspace root as an allowed destination explicitly, while retaining the guard against paths above or outside the workspace.

## Implementation steps

1. Update `rerootTree` to permit a target equal to the remote workspace root.
2. Add regression coverage proving a remote tree returns to its workspace root and that a target outside the workspace remains refused.
3. Update the remote file navigator spec to describe returning to the remote workspace root.

## Tests

- `src/file-navigator/navigation.test.ts` covers navigation from a nested remote directory to the workspace root and refusal of a destination above that root.

## Out of scope

- Remote navigator persistence or restoration.
- Changes to remote path resolution for `files` commands.
- User documentation; the existing public docs do not describe this navigation detail.
