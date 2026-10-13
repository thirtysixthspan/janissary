# Carry stale-save checks to remote hosts

## Complexity

7/10. The behavior crosses the editor, filesystem port, remote request schema, and remote host dispatcher, but each layer already has a focused contract and test suite to extend.

## Goal

A remote editor save writes only when the remote file still matches the content the editor last loaded or saved. A conflict preserves the authoritative remote bytes, cached copy, and editor draft until the user confirms overwrite.

## Approach

Pass the editor's optional `expectedHash` through `saveFile`, `FileSystemPort.writeFile`, and the remote write-file request. The remote host compares the target's UTF-8 text immediately before its atomic write, dropping a leading byte-order mark and allowing a missing file as local stale-save behavior does. Return a stale conflict through the existing write failure result. An overwrite request omits the precondition. Increment the remote protocol version so older hosts cannot silently ignore the field.

## Implementation steps

1. Add conditional-write support to `FileSystemPort.writeFile` and the local filesystem port, with direct coverage for matching, stale, BOM, and missing-file behavior.
2. Carry `expectedHash` through remote serialization, validation, decoding, and dispatch; bump and document the remote protocol version. If this pushes the operation table over the file-size limit, extract the write-file descriptor into a focused module.
3. Forward the precondition from editor saves and test remote conflict preservation followed by confirmed overwrite.
4. Update `product/specs/editor-tab.md` and `product/specs/websocket-rpc.md`.

## Tests

- Local conditional writes refuse changed content and allow a matching hash, a leading BOM, and a missing target.
- Remote requests preserve an optional precondition and reject malformed values without reaching the filesystem.
- A remote file changed after editor load remains unchanged, as do the local cache and editor draft; a confirmed overwrite then writes and advances them.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Filesystem-wide locking against an external process changing the file after comparison.
- Changes to save behavior for local files or unrelated remote RPC operations.
