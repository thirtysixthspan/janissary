# Hosted write tool 4 — contained mutation target and parent creation

**Complexity: 4/10** — ~85 added lines in one new module, 8 requirements, 13 containment scenarios (p=5.10).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 4 of 15 in the hosted write tool series. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`) for the shared path and secret policy.

Before any write or edit touches the disk, the tool has to know the destination is inside the root, not secret, and a regular file or nothing at all. And `file write` creates missing parent folders, which is itself a mutation that must obey the same rules. This plan builds that resolver and the guarded parent creation, on whichever machine holds the workspace. Plans 5 and 6 use it; nothing else calls it yet.

## Goal

One resolver that turns a root and a requested relative path into either a policy refusal or a contained real destination, plus a guarded step that creates missing parents only after every check has passed and rechecks the destination immediately before the caller writes.

## Design decisions and dependencies

- Source plan decision: validate lexical paths, the nearest existing ancestor, and the resolved target against the real root and secret policy before directory creation, and recheck the resolved destination before the atomic write. Local tool writes need these physical checks because the existing port's `containedPath` is only lexical.
- Put the resolver in `src/file-write/target.ts`, which imports plan 1's policy and no port implementation.
- Order of checks: plan 1's lexical check (absolute paths, lexical escape, secret path, home secret) first; then resolve the real root and the nearest existing ancestor of the target with `realpathSync`, require that ancestor to be a directory inside the real root and not a secret location; then, when the target exists, follow a final symlink to the real target (matching how `LocalFileSystemPort.writeFile` follows one today) and repeat containment and secret checks on it.
- An existing ancestor that is a regular file refuses with the filesystem's own `ENOTDIR` reported through `fileOperationReason`, which already produces a one-line filesystem failure, rather than a new message; `File not found` would mislead. An ancestor symlink that resolves outside the root refuses with `Outside the workspace`.
- Regular-file classification of an existing target uses `lstat`/`stat` only, never an open: a directory is `Is a directory`; a pipe, socket, or device is `Not a text file`.
- The resolver reports whether the target exists, its real path, and the missing parent segments. Callers that require an existing file (plan 6) treat a missing target as `File not found`.
- Parent creation is a separate exported step: create the missing segments recursively under the real ancestor, then re-resolve the destination's parent with `realpathSync` and require it to still be inside the real root. Permission and other failures during creation return `fileOperationReason` text. Folders created before a later failure are left in place; there is no rollback.
- Everything is synchronous, so a caller can keep validation, creation, and its write in one owning-process turn.
- Refusals are returned as values (`FileOperationResult` failures with plan 1's words or `fileOperationReason` text), never thrown.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/policy.ts` (plan 1) | Lexical check, physical containment and secret check, stat classification |
| `src/path-containment.ts` `containedAbsolute` | Containment predicate |
| `src/file-navigator/file-operation-result.ts` `failureResult`, `runFileOperation`, `fileOperationReason` | Result shape and failure text |
| `src/file-navigator/filesystem-port.ts` `LocalFileSystemPort.writeFile` | Precedent for following a final symlink; unchanged |

## Proposed changes

Create `src/file-write/target.ts` exporting the resolver (root and relative path in, refusal or resolved destination out) and the guarded parent-creation-and-recheck step. Keep it under 200 counted lines.

## Tests

Add `src/file-write/target.test.ts` against temporary directories:

- A new file at the root and a new nested path resolve with the right missing segments; an existing regular file resolves to itself.
- Absolute path, `../` escape, `.env`, `nested/.env.local`, a `SECRET_DENY_PATHS` run, a home-anchored secret, and a symlink alias to a secret each refuse.
- An ancestor symlink escaping the root refuses with nothing created; an ancestor that is a regular file refuses with the filesystem reason and nothing created.
- A target symlink to a file inside the root resolves to the real file; one escaping the root refuses.
- A directory target is `Is a directory`; a named pipe is `Not a text file` and is never opened.
- Parent creation makes every missing segment; a parent without write permission returns the permission reason; a parent swapped for an escaping symlink between resolution and recheck is refused by the recheck.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Content validation, hashing, and the write itself (plan 5); edits (plan 6).
- Port, remote, or command wiring (plans 7 through 13).
- Protection against hostile concurrent filesystem changes beyond the repository's existing containment model.
