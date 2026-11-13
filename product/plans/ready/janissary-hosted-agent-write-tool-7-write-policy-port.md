# Hosted write tool 7 — tool-text write policy on the filesystem port contract

**Complexity: 3/10** — ~30 added lines, 1 edited file plus a small adapter, 5 requirements, 10 scenarios (p=4.79).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 7 of 15 in the hosted write tool series. Depends on plan 2 (its pieces 2a/2b/2c1/2c2, complete) for the `FileWritePolicy` type and plan 5 (`janissary-hosted-agent-write-tool-5-tool-text-write.md`, complete) for the helper the policy selects. Both have landed on this branch, so this plan can start immediately.

Editor saves and binary-file writes already go through `FileSystemPort.writeFile`. The tool write should use that same contract, so local and remote workspaces are reached the same way, but the tool's stricter rules must not leak onto editor and binary saves. This plan adds an explicit, optional selector to the contract and implements it on the local port. Plan 8 carries it over the remote channel.

## Goal

`FileSystemPort.writeFile` accepts an optional trailing `policy` of `'tool-text'`. With it, `LocalFileSystemPort` runs plan 5's tool-text write. Without it, every existing write behaves exactly as today.

## Design decisions and dependencies

- Source plan decision: name the selector `policy`, accept only the optional literal `tool-text`, and pass it as a trailing port argument. Omission preserves the old behavior, including binary writes, symlink-following, and the existing optional-hash semantics.
- Type the parameter as `policy?: FileWritePolicy`, importing the type from `src/file-write/types.ts` (`export type FileWritePolicy = 'tool-text'`); do not declare a second literal.
- The port contract stays bytes (`Uint8Array`). With the tool policy, the local port decodes the bytes with a fatal UTF-8 decoder that keeps a leading BOM (`ignoreBOM: true`, so supplied text that starts with a BOM is written exactly) and hands the text and optional hash to plan 5's helper. Invalid UTF-8 (the `TypeError` a fatal `TextDecoder` throws) is refused as `failureResult('Not a text file')`.
- Before decoding, the adapter refuses a buffer whose `byteLength` exceeds `FILE_POLICY_MAX_BYTES` (`src/file-read/policy.ts`) with the same `File too large (>5 MB)` reason that `encodeToolText` in `src/file-write/filesystem.ts` uses, so an oversized buffer is never decoded. NUL bytes, containment, secret paths, symlinks, parent creation and the hash precondition are left to `writeToolTextFile`; the adapter does not re-check them.
- Put the bytes-to-text adapter in `src/file-write/port-adapter.ts` as `writeToolTextBytes(root, relPath, content, expectedHash?)` returning `FileOperationResult`, so `src/file-navigator/filesystem-port.ts` (180 counted lines) gains only the import, the signature change and a one-line branch and stays under 200. The adapter imports plan 5's helper and no port implementation, which keeps the dependency one-way.
- The policy branch is the **first** statement of `LocalFileSystemPort.writeFile` (`src/file-navigator/filesystem-port.ts`, `writeFile(root: string, relPath: string, content: Uint8Array, expectedHash?: string): FileOperationResult`), before its `containedPath(root, relPath)` check and its inline `expectedHash` check. The tool path must not run the editor's containment, hash, or symlink-following logic: `writeToolTextFile` resolves the target itself through `resolveMutationTarget` (`src/file-write/target.ts`) and applies its own hash rule (a missing target skips the check). The existing body below the branch stays byte-for-byte unchanged.
- `RemoteFileSystemPort.writeFile` (`src/file-navigator/remote/port.ts`, `async writeFile(root, relPath, content, expectedHash?)`) keeps its current signature in this plan; a method with fewer parameters still satisfies the interface. No caller passes `policy` until plan 11, and plan 8 lands the remote half before then, so no remote write can silently drop the selector in practice.
- `src/remote/serve-file-navigator.ts` constructs a `LocalFileSystemPort` on the far side, and `src/remote/filesystem/write-file-operation.ts` calls `context.filesystem.writeFile(context.root, args.path, Buffer.from(args.content, 'base64'), args.expectedHash)`. Leave that call unchanged here; plan 8 adds the selector to it, and the far side then runs this same branch.
- The only implementers of `FileSystemPort` are `LocalFileSystemPort` and `RemoteFileSystemPort`; no test fake implements the interface, so no fake needs updating.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/filesystem-port.ts` `FileSystemPort.writeFile`, `LocalFileSystemPort.writeFile` | Contract and current local behavior |
| `src/file-write/filesystem.ts` `writeToolTextFile(root, relativePath, content, expectedHash?)` (plan 5) | The tool-text write: NUL/ill-formed refusal, size, target resolution, hash, parents, atomic write |
| `src/file-write/types.ts` `FileWritePolicy` (plan 2) | The policy literal type |
| `src/file-read/policy.ts` `FILE_POLICY_MAX_BYTES` | Pre-decode size cap |
| `src/file-navigator/file-operation-result.ts` `failureResult` | Refusal shape |
| `src/editor/save.ts` | The main existing caller; unchanged |

## Proposed changes

Extend the `FileSystemPort.writeFile` signature and its comment with the optional trailing `policy`. In `LocalFileSystemPort.writeFile`, branch to `writeToolTextBytes` when the policy is present and keep the existing body as the no-policy path. Create `src/file-write/port-adapter.ts` with the decoding adapter. No other caller changes; `src/editor/save.ts` and the remote operation keep calling without a policy.

## Tests

- `src/file-navigator/filesystem-port.test.ts` (extend the existing `writeFile` cases, using the file's temp-root helpers): with the policy, a secret path and an escaping symlink refuse, invalid UTF-8 bytes refuse as `Not a text file`, a buffer over `FILE_POLICY_MAX_BYTES` refuses as `File too large (>5 MB)`, a stale `expectedHash` refuses with `SAVE_CONFLICT_ERROR`, a nested path creates parents, and a BOM-prefixed buffer is written byte for byte; without the policy, a binary buffer with NUL bytes is written as before and an existing hash-checked save behaves as before.
- Keep `src/editor/save.test.ts`, `src/file-navigator/remote/port.test.ts` and other port consumers green unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each change. No end-to-end manual check is reachable yet (no caller passes `policy` until plan 11), so the port tests are the verification; confirm with `git diff` that `src/editor/save.ts` and `src/remote/filesystem/write-file-operation.ts` are untouched.

## Out of scope

- Remote transport of the selector and the protocol version bump (plan 8).
- The edit contract (plans 9 and 10).
- Changing editor save or binary write semantics.
