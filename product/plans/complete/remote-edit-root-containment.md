# Refuse root-escaping relative paths in the remote edit and tool write

**Complexity: 2/10** — ~8 added lines, 1 file, 3 requirements, 5 scenarios (p=4.01)

`remoteEditFile` and `remoteWriteFile` under the tool-text policy refuse only absolute paths, then map the relative path against the remote workspace. A parent-relative path such as `../b.txt` under a subfolder root becomes a workspace-relative path the far side accepts, while `LocalFileSystemPort` refuses the same input as `Outside the workspace` relative to the root it was given. The two ports therefore enforce different containment boundaries behind one contract.

## Goal

Both ports refuse root-escaping paths for text edits and tool-text writes with the same `Outside the workspace` reason, before any frame is sent.

## Approach

Add one helper in `src/file-navigator/remote/port-reads.ts` that reports whether a path is absolute or resolves outside `root` (`path.posix.relative(root, path.posix.resolve(root, relPath))` is `..` or starts with `../`). Use it in `remoteEditFile` and in `remoteWriteFile` when a policy is supplied. Editor saves without a policy keep their current mapping and sending.

## Implementation steps

1. Add the `outsideRoot(root, relPath)` helper to `port-reads.ts`.
2. Replace the absolute-only checks in `remoteEditFile` and the policy branch of `remoteWriteFile` with the helper.

## Tests

- `src/file-navigator/remote/port.test.ts`: `editFile('/remote/ws/src', '../b.txt', ...)` resolves `Outside the workspace` and sends no frame.
- Same file: tool-text `writeFile('/remote/ws/src', '../b.txt', ...)` resolves `Outside the workspace` and sends no frame.
- `src/file-navigator/filesystem-port-policy.test.ts`: the local `editFile` and tool-text `writeFile` refuse `../` paths under a subfolder root with the same reason and leave the sibling file untouched.
- Existing frame-shape, zero-replacement, and close/end/timeout tests pass unchanged.

## Spec

Update the file navigator spec to state that remote agent edits and tool writes refuse paths that leave the tab's root, as local ones do.

## Out of scope

- Editor saves without a policy.
- The far side's workspace-level check, which stays as defence in depth.
- The second backlog entry (close-reason assertion).
