# Hosted write tool 4 — contained mutation target and parent creation

**Complexity: 5/10** — ~110 added lines in one new module, 10 requirements, 17 containment scenarios (p=5.39).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 4 of 15 in the hosted write tool series. Depends on plan 1 (`./product/plans/complete/janissary-hosted-agent-write-tool-1-shared-file-policy.md`, landed) for the shared path and secret policy in `src/file-read/policy.ts`. It does not depend on plans 2a–3; nothing in `src/file-write/{types,messages,command}.ts` is needed here.

Before any write or edit touches the disk, the tool has to know the destination is inside the root, not secret, and a regular file or nothing at all. And `file write` creates missing parent folders, which is itself a mutation that must obey the same rules. This plan builds that resolver and the guarded parent creation, on whichever machine holds the workspace. Plans 5 (`filesystem.ts`, write) and 6 (`edit.ts`, edit) use it; nothing else calls it yet, so there is no user-visible behavior change and no spec update.

## Goal

One resolver that turns a root and a requested relative path into either a policy refusal or a contained real destination, plus a guarded step that creates missing parents only after every check has passed and rechecks the destination immediately before the caller writes.

## Design decisions and dependencies

- Source plan decision: validate lexical paths, the nearest existing ancestor, and the resolved target against the real root and secret policy before directory creation, and recheck the resolved destination before the atomic write. Local tool writes need these physical checks because the existing port's `containedPath` (`src/path-containment.ts`) is only lexical.
- Put the resolver in `src/file-write/target.ts`, which imports `src/file-read/policy.ts` (with `.js` extension: `'../file-read/policy.js'`), `src/file-navigator/file-operation-result.ts`, and `node:fs`/`node:path` only — no port implementation (`filesystem-port.ts`).
- Exported API (names decided):
  - `WriteTarget` type: `realRoot` (realpath of the root), `realPath` (the real destination: the followed real file when it exists, otherwise the real nearest existing ancestor joined with the missing segments), `exists` (boolean), and `missingSegments` (the path segments below the real ancestor that do not exist yet, in order, excluding the final file name; empty when the parent exists).
  - `resolveMutationTarget(root, requested)` returning `FileOperationResult<WriteTarget>`.
  - `createTargetParents(target)` returning `FileOperationResult<string>` whose value is the rechecked real destination path the caller must write to.
- Order of checks in `resolveMutationTarget`, each returning on the first failure:
  1. `checkLexicalPath(root, requested)` (`src/file-read/policy.ts`) — absolute paths, lexical escape, secret segments, home secrets.
  2. `realpathSync(root)`; a failure returns `fileOperationReason(error)`.
  3. Walk up from `path.resolve(root, requested)`'s parent to find the nearest existing ancestor: `realpathSync` each candidate; on `ENOENT` move to its parent and record the segment as missing; on any other error (notably `ENOTDIR` when an ancestor is a regular file, `EACCES`, `ELOOP`) stop and return `fileOperationReason(error)`. `ENOTDIR` is not in `ERROR_REASONS`, so it surfaces as `Filesystem error ENOTDIR; check the item and destination, then try again` — that is the intended text, not a new message; `File not found` would mislead. Do not reuse `policy.ts`'s private `resolveExisting`, which swallows every error.
  4. `statSync` the real ancestor; it must be a directory, otherwise return `fileOperationReason` of a synthetic `ENOTDIR` (same text as step 3).
  5. `checkRealTarget(realRoot, realAncestor)`, then `checkRealTarget(realRoot, <realAncestor joined with the missing segments and file name>)` — both arguments canonical as `checkRealTarget`'s contract requires. An ancestor symlink that resolves outside the root therefore refuses with `Outside the workspace`.
  6. If the target exists (`lstatSync` succeeds): when it is a symlink, follow it with `realpathSync` (matching `LocalFileSystemPort.writeFile` at `src/file-navigator/filesystem-port.ts`, `if (lstatSync(target).isSymbolicLink()) target = realpathSync(target)`) and run `checkRealTarget` on the result. A dangling final symlink (realpath fails) refuses with `Not a text file` — it is not a regular file and cannot be classified without following it.
  7. Classify the existing real target with `statSync` only, never an open: directory is `Is a directory`; anything that is not a regular file (pipe, socket, device) is `Not a text file`. Do **not** call `classifyStats` here: it also applies the 5 MB size rule, which is wrong for a whole-file write that replaces a large file. Size limits stay with the callers (plan 6 checks the existing size itself; plan 5 checks the new content).
- A requested path naming the root itself (`''` or `.`) passes the lexical check, exists, and resolves to `Is a directory`.
- Callers that require an existing file (plan 6) treat `exists: false` as `File not found`; the resolver itself never returns `File not found`.
- `createTargetParents(target)`: when `missingSegments` is empty, skip creation. Otherwise `mkdirSync(<real ancestor + missing segments>, { recursive: true })` inside `runFileOperation`, so permission and other failures return `fileOperationReason` text. Then, always, recheck: `realpathSync` the destination's parent, require `checkRealTarget(realRoot, realParent)` and `checkRealTarget(realRoot, realParent + file name)` to pass, and if the destination now exists as a symlink, follow and recheck it as in step 6. The returned path is the rechecked real destination. Folders created before a later failure are left in place; there is no rollback.
- Everything is synchronous (no `fs/promises`, no await), so a caller can keep validation, creation, and its write in one owning-process turn.
- Refusals are returned as values (`failureResult(<FilePolicyFailure>)` or `fileOperationReason` text), never thrown; wrap every filesystem call so no exception escapes.
- Keep the module under the 200-line `max-lines` limit and each function under the `sonarjs/cognitive-complexity` limit (~15): split the ancestor walk, the existing-target check, and the recheck into private helpers.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-read/policy.ts` `checkLexicalPath`, `checkRealTarget`, `FilePolicyFailure` | Lexical check; physical containment and secret check on canonical paths |
| `src/file-read/read.ts` `loadBytes` | Precedent for realpath root + target, then `checkRealTarget`, then stat classification |
| `src/path-containment.ts` `containedAbsolute` | Already used inside `checkRealTarget`; no direct call needed |
| `src/file-navigator/file-operation-result.ts` `FileOperationResult`, `failureResult`, `runFileOperation`, `fileOperationReason` | Result shape and failure text |
| `src/file-navigator/filesystem-port.ts` `LocalFileSystemPort.writeFile` | Precedent for following a final symlink; unchanged |
| `src/file-read/policy.test.ts` (`execFileSync('mkfifo', [pipe])`) | Precedent for creating a named pipe in tests |

## Proposed changes

Create `src/file-write/target.ts` exporting `WriteTarget`, `resolveMutationTarget`, and `createTargetParents` as decided above. No existing file changes.

## Tests

Add `src/file-write/target.test.ts` against `mkdtempSync` temporary directories, with roots passed through `realpathSync` where the assertion compares real paths (macOS `/var` → `/private/var`):

- A new file at the root (`missingSegments` empty) and a new nested path (`a/b/c.txt` → `['a','b']`) resolve with `exists: false`; an existing regular file resolves to itself with `exists: true`.
- Absolute path, `../` escape, `.env`, `nested/.env.local`, a `SECRET_DENY_PATHS` run (for example `.claude/.credentials.json`), a home-anchored secret, and a symlink inside the root aliasing a secret path each refuse with the policy word.
- An ancestor symlink escaping the root refuses with `Outside the workspace` and nothing created; an ancestor that is a regular file refuses with the `ENOTDIR` reason and nothing created.
- A target symlink to a file inside the root resolves to the real file; one escaping the root refuses; a dangling one is `Not a text file`.
- A directory target and the root itself are `Is a directory`; a named pipe is `Not a text file` and the test does not hang (proving it was never opened).
- An existing file over 5 MB resolves successfully (size is not this module's rule).
- `createTargetParents` makes every missing segment and returns the real destination; with no missing segments it creates nothing; a parent without write permission (`chmodSync(dir, 0o500)`, restored in `afterEach`) returns the permission reason; a missing segment replaced by an escaping symlink between `resolveMutationTarget` and `createTargetParents` is refused by the recheck with `Outside the workspace`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the new server tests). There is no caller yet, so there is no manual end-to-end check; plans 5 and 6 exercise it through their own tests.

## Out of scope

- Content validation, hashing, and the write itself (plan 5); edits and the existing-file size check (plan 6).
- Port, remote, or command wiring (plans 7 through 13).
- Changing `LocalFileSystemPort.writeFile` or `src/file-read/policy.ts`.
- Protection against hostile concurrent filesystem changes beyond the repository's existing containment model.
