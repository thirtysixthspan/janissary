# Refuse file write and edit paths that end in a path separator
**Complexity: 2/10** — ~8 added lines, 2 files, 3 requirements, 6 scenarios (p=4.24)

## Goal

`file write` and `file edit` silently treat a path ending in a separator, such as `notes/`, as the file name `notes`, because `path.resolve` and the remote port's path mapping both drop the trailing slash. Refuse such a path with `Is a directory: <path>.` on local and remote tabs alike, before anything is written and before any remote frame is sent.

## Approach

- Add an exported `endsInSeparator(requested)` helper in `src/file-write/target.ts` that is true when the raw path ends in `/` or in `path.sep`.
- In `resolveMutationTarget`, return `failureResult('Is a directory')` first when `endsInSeparator(requested)`. This covers direct `LocalFileSystemPort` writes and edits and the far-side `write-file`/`edit-file` handlers.
- In `applyMutation` in `src/file-write/tab-write.ts`, return `mutationFailureLine('Is a directory', request.path)` when `endsInSeparator(request.path)`, before the lone-surrogate check. This runs before any port call, so typed commands, the local ACP route, and remote-hosted loops refuse identically and a remote tab sends no frame (the remote port strips the slash, so the near-side check is the one that covers remote tabs).
- `parseFileMutation` is unchanged; usage errors stay as they are. `file read` is out of scope.

## Implementation steps

1. Add `endsInSeparator` and the refusal at the top of `resolveMutationTarget`.
2. Add the refusal in `applyMutation`.

## Tests

- `src/file-write/tab-write.test.ts`: local write to `notes/` prints `Is a directory: notes/.` and creates nothing; local edit to `a.txt/` refused and the file unchanged; remote write and edit with trailing separator refused with no frame sent.
- `src/file-write/target.test.ts`: `resolveMutationTarget(root, 'a.txt/')` refused with `Is a directory` for an existing file and for a missing one.

## Specs and docs

- `help/file.md`: add the trailing-separator case to the mutation failure list.
- `product/specs/acp.md`: note the refusal in the typed write/edit paragraph.

## Out of scope

- `file read` behavior.
- Usage-error parsing in `parseFileMutation`.
