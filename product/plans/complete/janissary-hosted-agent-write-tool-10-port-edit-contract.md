# Hosted write tool 10 — `editFile` on both filesystem ports

**Complexity: 5/10** — ~28 added lines across 4 files, 6 requirements, 11 scenarios (p=5.33).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 10 of 15 in the hosted write tool series. Depends on plan 6 (the tool-text edit helper `editToolTextFile` in `src/file-write/edit.ts`), plan 8 (`janissary-hosted-agent-write-tool-8-remote-write-policy.md`, which created the wrapper module's `remoteWriteFile`), and plan 9 (`janissary-hosted-agent-write-tool-9-edit-file-operation.md`, the far-side `edit-file` operation). All three are complete on this branch, so this plan has no pending prerequisites.

With the far side able to edit, the filesystem port contract gets an edit method, so the command executor in plan 11 can edit any workspace through whatever port the tab has. Locally it runs plan 6's helper; remotely it sends plan 9's `edit-file`.

## Goal

`FileSystemPort.editFile(root, relPath, oldString, newString, replaceAll)` returns `FileOperationResult<FileEditValue>` (`{ replacements: number }`, a positive integer on success) on both `LocalFileSystemPort` and `RemoteFileSystemPort`, with refusals, closed sessions, ended connections, and timeouts all reported as failure values.

## Design decisions and dependencies

- Signature (decided): `editFile(root: string, relPath: string, oldString: string, newString: string, replaceAll: boolean): MaybePromise<FileOperationResult<FileEditValue>>`. `replaceAll` is **required**, matching `editToolTextFile`'s required `replaceAll: boolean` (`src/file-write/edit.ts`) and the wire's required `replaceAll` (`src/remote/protocol-frames.ts` `'edit-file': { path; oldString; newString; replaceAll: boolean }`). Callers (plan 11) supply `false` themselves; the port does not default it. `FileEditValue` is imported as a type from `src/file-write/types.ts`.
- It always enforces the tool-text policy and takes no `policy` selector (unlike `writeFile`'s optional `policy?: FileWritePolicy`). In the interface, place it directly after `writeFile`, with a one-line comment saying it always applies the tool-text rules. It belongs to the "result can express failure" group described in the interface's header comment (`src/file-navigator/filesystem-port.ts`, `// One tree's view of a filesystem…`); that comment's list of result types names types, not methods, so it needs no edit.
- `LocalFileSystemPort.editFile` is a one-line delegation to `editToolTextFile(root, relPath, oldString, newString, replaceAll)`, returning its value synchronously, the same way `writeFile` delegates to `writeToolTextBytes` under `policy === 'tool-text'`. No extra containment check: `resolveMutationTarget` already refuses absolute and escaping paths with `Outside the workspace` (`src/file-write/target.test.ts`). The file is at 185 counted lines; this adds about 3 lines plus one import, staying under 200.
- `RemoteFileSystemPort.editFile` (`src/file-navigator/remote/port.ts`, 191 counted lines) is a one-line delegation `remoteEditFile(this.requester(), this.paths, …)`, mirroring the existing `writeFile` → `remoteWriteFile` delegation. Add `remoteEditFile` to the existing import from `./port-reads.js` rather than a new import line, so `port.ts` stays under 200.
- New wrapper `remoteEditFile(request, paths, root, relPath, oldString, newString, replaceAll)` in `src/file-navigator/remote/port-reads.ts`, beside `remoteWriteFile`. Behavior:
  - An absolute path (`path.posix.isAbsolute(relPath)`) is answered locally with `failureResult('Outside the workspace')` and no frame — the same check `remoteWriteFile` applies under a policy, and the same reason the local helper returns.
  - Otherwise it maps the path with `await paths.to(root, relPath)` and sends `request('edit-file', { path, oldString, newString, replaceAll })`, where `path` is the plain mapped string and `oldString` and `newString` are each one layer of UTF-8 base64 (`Buffer.from(text, 'utf8').toString('base64')`), exactly what plan 9's operation decodes (`src/remote/filesystem/edit-file-operation.ts`: `path: requireString(args.path)`, `oldString: requireBase64Text(args.oldString)`). Do **not** base64 the path: the operation reads it as a plain string and its containment check (`paths: (args) => [args.path]`) would see the encoded text. `product/specs/remote-server.md` currently says the path is base64 too; the code is authoritative, and step 5 corrects the spec.
  - The reply is already validated by `resultDecoders['edit-file']` (`src/remote/filesystem/result-decoders.ts`: success requires a safe integer `replacements >= 1`), so the wrapper does no decoding of its own.
  - Update the module's header comment (`// RemoteFileSystemPort's line read and write…`) to mention the edit.
- Settlement: `RemotePortRequests` (`src/file-navigator/remote/port-requests.ts`) already turns close, connection end, and timeout into `{ ok: false, reason }` for result-shaped operations; reuse it unchanged. Add `'edit-file'` to `LONG_RUNNING` beside `'write-file'`, and extend the comment above `LONG_REQUEST_DEADLINE_MS` (`… whole-file transfers — get far longer.`) to mention edits. No retry: a timed-out or disconnected edit reports the existing remote reason (`The remote machine did not answer in time.`, `The remote connection ended.`, `The remote file navigator is closed.`) and may already have committed. A late reply after expiry is dropped. Cancellation can prevent a request that has not been sent but cannot undo a committed edit.
- No test fakes need updating: every `FileSystemPort` fake in the repo is a partial object cast (`{} as FileSystemPort`, `{ writeFile } as FileSystemPort`, `as unknown as FileSystemPort` in `src/file-navigator/remote/file-cache.test.ts`, `src/file-navigator/manager/files.test.ts`, `src/file-navigator/manager/profile.test.ts`, `src/plugins/origin-workspace.test.ts`), and the only `implements FileSystemPort` classes are the two ports this plan edits.
- Web typecheck: `filesystem-port.ts` is reachable from the web project through `@shared`. The new import chain (`src/file-write/edit.ts` → `edit-text.ts`, `target.ts`, `src/file-read/policy.ts`) adds nothing beyond what `writeToolTextBytes` (`src/file-write/port-adapter.ts`) already pulls in, and `web/tsconfig.json` includes `ES2024.String`. Run `npm run typecheck:diff` and confirm the web project stays green.
- Order: one commit is fine; to keep typecheck green at each step, add the interface member and both implementations together.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/filesystem-port.ts` `FileSystemPort`, `LocalFileSystemPort.writeFile` | Port contract; one-line tool-text delegation pattern |
| `src/file-write/edit.ts` `editToolTextFile`; `src/file-write/types.ts` `FileEditValue` | Local edit and result value type |
| `src/file-navigator/remote/port-reads.ts` `remoteWriteFile` | Shape of the new wrapper (absolute-path refusal, path mapping, base64) |
| `src/file-navigator/remote/port.ts` `writeFile` → `remoteWriteFile` | Remote delegation pattern |
| `src/file-navigator/remote/port-requests.ts` `RemotePortRequests`, `LONG_RUNNING`, `requestDeadline` | Settlement, failure shaping, and deadlines |
| `src/remote/filesystem/result-decoders.ts` `'edit-file'` | Reply validation (already present) |
| `src/remote/protocol-frames.ts` `'edit-file'` args | Wire shape (already present) |

## Proposed changes

1. `src/file-navigator/filesystem-port.ts`: add `editFile` to `FileSystemPort` after `writeFile`, and to `LocalFileSystemPort` after its `writeFile`, delegating to `editToolTextFile`.
2. `src/file-navigator/remote/port-reads.ts`: add `remoteEditFile` as described.
3. `src/file-navigator/remote/port.ts`: add `editFile` after `writeFile`, delegating to `remoteEditFile`.
4. `src/file-navigator/remote/port-requests.ts`: add `'edit-file'` to `LONG_RUNNING`; extend the deadline comment.
5. `product/specs/remote-server.md`: in the deadline paragraph (`… and a whole-file read or write — is given ten minutes.`), add a text edit to the list of work given ten minutes; the paragraph already says late replies are ignored, and the preceding paragraph already says nothing is retried. In the version-41 paragraph (`Version 41 also adds the edit-file operation, with arguments path, oldString and newString (each one base64 layer of UTF-8 text)…`), correct the wording so only `oldString` and `newString` are base64 and `path` is plain, matching `edit-file-operation.ts`.

## Tests

- `src/file-navigator/filesystem-port-policy.test.ts` (the existing tool-text port tests, 89 lines): local `editFile` replaces a single match and reports `replacements: 1`; with `replaceAll: true` replaces every match and reports the count; refuses zero matches and multiple matches (without `replaceAll`) with plan 6's reasons (`NO_MATCHING_TEXT_REASON`, `MULTIPLE_MATCHES_REASON` from `src/file-write/types.ts`) and leaves the file unchanged; an absolute path returns `Outside the workspace`.
- `src/file-navigator/remote/port.test.ts`, alongside the existing tool-policy `writeFile` cases (`forwards the tool-text policy only when supplied…`, `answers an absolute path under the tool policy locally…`): the `edit-file` frame carries the plain mapped `path`, base64 `oldString`/`newString` (one layer, non-ASCII text such as `héllo` round-trips) and the boolean `replaceAll`; a success reply resolves to `{ ok: true, value: { replacements: n } }`; a reply with `replacements: 0` fails as an invalid result; an absolute path resolves `Outside the workspace` without a frame; close, connection end, and timeout each resolve as failure values with the reasons above; a late reply after timeout is dropped and no second frame is sent.
- `src/file-navigator/remote/port-requests.test.ts`: `requestDeadline('edit-file')` is `LONG_REQUEST_DEADLINE_MS`, next to the existing `git-pull`/`search` assertions.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` (lint, `typecheck:diff` for both projects, related server tests).
- No manual end-to-end check is possible yet: nothing calls `editFile` until plan 11. The port tests above, including the remote harness in `port.test.ts`, are the end-to-end coverage for this subplan.

## Out of scope

- Typed commands and ACP routing (plans 11 through 13).
- Any change to the far-side `edit-file` operation, its decoder, or the protocol version (plan 9).
- Retrying uncertain mutations, or adding a lock or queue service.
