# Hosted write tool 5 — tool-text whole-file write on the owning machine

**Complexity: 5/10** — ~70 added lines in one new module, 0 edited files, 11 requirements, 16 test scenarios (p=5.31).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 5 of 15 in the hosted write tool series. Depends on plan 1 (`janissary-hosted-agent-write-tool-1-shared-file-policy.md`), plan 2 (split into 2a/2b/2c1/2c2; nothing from it is imported here, because this helper takes plain arguments rather than a `FileWriteRequest`), and plan 4 (`janissary-hosted-agent-write-tool-4-contained-target.md`) for target resolution and parent creation.

This is the effectful core of `file write`: a synchronous helper that runs on whichever machine holds the workspace and creates or replaces one UTF-8 text file. Plan 4 already decides where the file may go; this plan decides what may be written and writes it. Nothing calls it from a port or a command yet.

## Goal

A tool-text whole-file write that validates the supplied text, honors an optional expected hash, creates missing parents through plan 4, writes atomically, and reports every refusal as a `FileOperationResult` value.

## Design decisions and dependencies

- Source plan decision: put the effectful tool write/edit helpers in `src/file-write/filesystem.ts`, which must not import the port implementation. This plan adds the write; plan 6 adds the edit in its own module.
- Content rule: the supplied text is UTF-8 encoded once (`Buffer.from(content, 'utf8')`) exactly as given, with no newline normalization; a leading BOM in the supplied text is written as given. Text containing NUL, or a lone surrogate (which cannot round-trip through UTF-8, so encode-then-decode equality is the check), is refused as `Not a text file`; detect the lone surrogate with `String.prototype.isWellFormed()` (ES2024 lib, Node 24, already used in `src/file-read/format.test.ts`) rather than an encode-then-decode comparison. Check order: NUL, then well-formedness, then size. Encoded content (`byteLength` of the encoded buffer against `FILE_POLICY_MAX_BYTES` from `src/file-read/policy.ts`; exactly 5 MiB passes) over 5 MiB is `File too large (>5 MB)`. Empty content is valid and creates or empties the file.
- Validation order: content checks first, then `resolveMutationTarget(root, relativePath)` from `src/file-write/target.ts` (its failure result is returned unchanged), so every refusal they can produce leaves no folder and no file behind. Only then does the optional hash check run, then plan 4's parent creation and recheck, then the write.
- Optional `expectedHash` reuses the editor's conflict convention as implemented in `LocalFileSystemPort.writeFile` (`src/file-navigator/filesystem-port.ts`, the `if (expectedHash !== undefined)` block): when `target.exists` is true, read `target.realPath` as UTF-8, strip one leading BOM, compare `contentHash`, and refuse with `SAVE_CONFLICT_ERROR` on mismatch. When `target.exists` is false the hash check is skipped and the file is created, as the existing port does. Before reading, `statSync(target.realPath)` and refuse with `File too large (>5 MB)` when its size exceeds `FILE_POLICY_MAX_BYTES`, so the hash read is bounded like the reader. Unlike the existing port, a read failure other than not-found (such as permission denied) is reported through `fileOperationReason` rather than treated as a passing precondition.
- The write calls `createTargetParents(target)` and passes its returned path (never `target.realPath`) with the encoded buffer to `atomicWriteFile` inside `runFileOperation`, so temporary output exists only beside the target on the owning machine and an existing file keeps its permissions. Filesystem failures map through `runFileOperation`/`fileOperationReason` and are never reported as success.
- If the write fails after plan 4 created folders, the folders stay, the failure is returned, and any existing target content is intact because the rename never happened. No rollback.
- The whole helper is one synchronous call with no await, so validation, hash check, and atomic replacement happen in one owning-process turn. It does not claim compare-and-swap protection against another process changing the file between check and rename.
- Failure reasons come from plan 1's policy words, `SAVE_CONFLICT_ERROR`, and `fileOperationReason` text; plan 11 formats them into one-line output.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-write/target.ts` (plan 4) | Resolution, parent creation, recheck |
| `src/file-read/policy.ts` (plan 1) | 5 MiB limit and policy words |
| `src/atomic-write.ts` `atomicWriteFile` | Sibling temporary file, mode retention, atomic rename |
| `src/editor/save-conflict.ts` `contentHash`, `SAVE_CONFLICT_ERROR` | Hash convention and conflict text |
| `src/file-navigator/file-operation-result.ts` | Result shape and failure vocabulary |

## Proposed changes

Create `src/file-write/filesystem.ts` exporting `writeToolTextFile(root, relativePath, content, expectedHash?)` returning `FileOperationResult` (void value on success). Plan 7's `src/file-write/port-adapter.ts` calls it by this name. Imports carry `.js` extensions; the module imports nothing from `src/file-navigator/filesystem-port.ts` or `src/file-navigator/remote/`. Keep the content check, hash check, and write as private helpers so the exported function stays under the `sonarjs/cognitive-complexity` limit; the module is ~70 lines, well under `max-lines`.

## Tests

Add `src/file-write/filesystem.test.ts` against temporary directories:

- Create a new file; replace an existing one; exact bytes for LF, CRLF, mixed endings, and supplied text starting with a BOM; empty content creates a file and empties an existing one.
- A nested path creates its parents and the file.
- NUL text and a lone surrogate refuse with no folder or file created; exactly 5 MiB is written; 5 MiB plus one byte refuses and leaves an existing file unchanged.
- A matching hash writes; a mismatched hash refuses with `SAVE_CONFLICT_ERROR` and leaves content and creates no folder; a hash for a missing target creates it; an unreadable existing target with a hash reports the permission reason.
- A read-only parent folder of an existing file (`chmodSync(dir, 0o500)`, restored in `afterEach`, as in `src/file-write/target.test.ts`) reports the permission reason and the file is unchanged. Do not use a read-only file: the atomic rename replaces it regardless of the file's own mode. Replacing a 0o600 file keeps 0o600. An existing target over 5 MiB with a hash refuses `File too large (>5 MB)` and is unchanged.
- A write that fails after parent creation (for example a read-only innermost created folder simulated by permissions) leaves the created folders in place.
- A refusal from plan 4 (secret path) passes through unchanged with nothing created.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after adding the module and its test. There is no manual end-to-end check yet: nothing calls the helper until plan 7 wires it into the port.

## Out of scope

- Edits (plan 6), port wiring (plans 7 and 8), and commands (plan 11).
- Changing `LocalFileSystemPort.writeFile` for editor or binary writes.
- Rolling back created folders; compare-and-swap guarantees against concurrent writers.
