# Refuse file write and edit paths whose last segment is a dot
**Complexity: 3/10** — ~12 added lines, 2 files, 4 requirements, 10 scenarios (p=4.64)

## Goal

A write or edit path whose final segment is `.` or `..`, such as `notes/.`, `a.txt/.` or `a/b/..`, passes the trailing-separator check and is then normalized by `path.resolve` (and by `RemotePortPaths.to` on a remote tab) to its parent name, so `file write` creates or overwrites a file named after the folder. Refuse every path that names a directory, meaning one ending in a separator (an empty final segment) or whose final segment is `.` or `..`, with `Is a directory: <path>.` before any filesystem effect or remote request, identically on local and remote tabs and in the far-side resolver.

## Approach

- In `src/file-write/target.ts`, rename `endsInSeparator(requested)` to `namesDirectory(requested)` and widen it: split the raw path on `/` and `path.sep`, and return true when the last segment is empty, `.` or `..`. A path that still escapes the root lexically (absolute, or normalizing to `..` or a `../` prefix) is not claimed by the dot rule, so `..`, `../..` and `/tmp/.` keep answering `Outside the workspace` exactly as today; the trailing-separator case keeps its current precedence unchanged.
- Update both callers: the first statement of `resolveMutationTarget` (direct `LocalFileSystemPort` calls and far-side `write-file`/`edit-file` handlers) and the first check in `applyMutation` in `src/file-write/tab-write.ts` (covers remote tabs before the port normalizes the dot away).
- `parseFileMutation` and `file read` stay unchanged.

## Implementation steps

1. Replace `endsInSeparator` with `namesDirectory` in `target.ts` and its use in `resolveMutationTarget`.
2. Switch `applyMutation` to `namesDirectory`.

## Tests

- `src/file-write/target.test.ts`: `a.txt/.` for an existing file, `notes/.` and `a/b/..` for missing paths refused with `Is a directory` and nothing created; `./a.txt` and a file named `.x` still resolve; `..` and `../..` still refused as `Outside the workspace`.
- `src/file-write/tab-write.test.ts`: local write to `notes/.` prints `Is a directory: notes/.` and creates nothing; local edit to `a.txt/.` leaves the file unchanged; remote write to `notes/.`, write to `notes/..`, and edit to `a.txt/.` refused with no frame sent.
- Existing trailing-separator tests keep passing unchanged.

## Specs and docs

- `help/file.md`: extend the trailing-separator bullet to name a final `.` or `..` segment.
- `product/specs/acp.md`: extend the matching clause in the typed write/edit paragraph.

## Out of scope

- `file read` path handling and `parseFileMutation` usage errors.
- Changing the precedence of trailing-separator refusals relative to workspace containment.
