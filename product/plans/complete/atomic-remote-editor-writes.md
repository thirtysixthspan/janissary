# Atomic remote editor file writes

## Complexity

6/10. The shared writer already owns temporary-file replacement and permission preservation, but its text-only input and replacement behavior need to be made safe for raw bytes and symlink paths at the remote filesystem boundary. The remote port and editor save tests pin failure handling and cache behavior.

## Goal

Remote editor saves preserve the prior file when a write or replacement fails, just like local editor saves. Binary file bytes pass through without decoding, existing permission bits remain, and a file symlink continues to update its target.

## Approach

Extend `atomicWriteFile` to accept `Uint8Array` without converting it to text. Use it in `LocalFileSystemPort.writeFile`, the filesystem boundary reached by remote writes, after resolving a file symlink or a symlinked parent to the path that the old direct write followed. Keep containment validation and `FileOperationResult` errors at the port boundary. The remote editor cache and draft continue to advance only after the remote operation succeeds.

## Implementation steps

1. Extend the shared atomic writer for strings and bytes.
2. Replace the direct write in `LocalFileSystemPort` and preserve file-symlink write-through behavior.
3. Add tests for binary round trips, permissions, symlink preservation, and replacement failure with temporary-file cleanup.
4. Update `product/specs/editor-tab.md` with the remote save guarantee.

## Tests

- Shared atomic writer preserves binary bytes and cleans up its temporary file after a failed replacement.
- Local filesystem port writes binary content atomically, preserves permissions, and writes through a file symlink.
- Remote serving test round-trips arbitrary bytes and reports replacement failure without damaging the existing target or leaving a temporary file.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Power-loss durability guarantees or protection from concurrent external edits.
- Changes to remote editor cache or draft behavior after successful writes.
- A broader symlink containment policy change.
