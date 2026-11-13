# Hosted write tool 7 — tool-text write policy on the filesystem port contract

**Complexity: 3/10** — ~30 added lines, 1 edited file plus a small adapter, 4 requirements, 8 scenarios (p=4.59).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 7 of 15 in the hosted write tool series. Depends on plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`) for the policy type and plan 5 (`janissary-hosted-agent-write-tool-5-tool-text-write.md`) for the helper the policy selects.

Editor saves and binary-file writes already go through `FileSystemPort.writeFile`. The tool write should use that same contract, so local and remote workspaces are reached the same way, but the tool's stricter rules must not leak onto editor and binary saves. This plan adds an explicit, optional selector to the contract and implements it on the local port. Plan 8 carries it over the remote channel.

## Goal

`FileSystemPort.writeFile` accepts an optional trailing `policy` of `'tool-text'`. With it, `LocalFileSystemPort` runs plan 5's tool-text write. Without it, every existing write behaves exactly as today.

## Design decisions and dependencies

- Source plan decision: name the selector `policy`, accept only the optional literal `tool-text`, and pass it as a trailing port argument. Omission preserves the old behavior, including binary writes, symlink-following, and the existing optional-hash semantics.
- The port contract stays bytes (`Uint8Array`). With the tool policy, the local port decodes the bytes with a fatal UTF-8 decoder that keeps a leading BOM (`ignoreBOM: true`, so supplied text that starts with a BOM is written exactly) and hands the text and optional hash to plan 5's helper. Invalid UTF-8 is refused as `Not a text file`.
- Put the bytes-to-text adapter in `src/file-write/port-adapter.ts`, so `src/file-navigator/filesystem-port.ts` (180 counted lines) gains only the signature change and a one-line branch and stays under 200. The adapter imports plan 5's helper and no port implementation, which keeps the dependency one-way.
- `RemoteFileSystemPort.writeFile` keeps its current signature in this plan; a method with fewer parameters still satisfies the interface. No caller passes `policy` until plan 11, and plan 8 lands the remote half before then, so no remote write can silently drop the selector in practice.
- `src/remote/serve-file-navigator.ts` constructs a `LocalFileSystemPort` on the far side, so once plan 8 forwards the selector, the far side runs this same branch.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/file-navigator/filesystem-port.ts` `FileSystemPort.writeFile`, `LocalFileSystemPort.writeFile` | Contract and current local behavior |
| `src/file-write/filesystem.ts` (plan 5) | The tool-text write |
| `src/file-write/types.ts` (plan 2) | The policy literal type |
| `src/editor/save.ts` | The main existing caller; unchanged |

## Proposed changes

Extend the `FileSystemPort.writeFile` signature and its comment with the optional trailing `policy`. In `LocalFileSystemPort.writeFile`, branch to the adapter when the policy is present and keep the existing body as the no-policy path. Create `src/file-write/port-adapter.ts` with the decoding adapter. Update test fakes implementing `FileSystemPort` only if the type change requires it.

## Tests

- `src/file-navigator/filesystem-port.test.ts`: with the policy, a secret path and an escaping symlink refuse, invalid UTF-8 bytes refuse as `Not a text file`, oversized content refuses, a nested path creates parents, and a BOM-prefixed buffer is written byte for byte; without the policy, a binary buffer with NUL bytes is written as before and an existing hash-checked save behaves as before.
- Keep `src/editor/save.test.ts` and other port consumers green unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Remote transport of the selector and the protocol version bump (plan 8).
- The edit contract (plans 9 and 10).
- Changing editor save or binary write semantics.
