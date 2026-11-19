# Supplement file command with additional sub commands — 6: caller-side remote port methods and executor wiring

**Complexity: 5/10** — ~75 added lines across 6 files, 5 new port methods, 6 requirements (p=5.61)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 6 of 8. It depends on subplans 1-3 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`, `...-2-exists-local.md`, `...-3-head-tail-local.md`) for the executors and on subplan 4 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-4-remote-frames-and-version.md`) for the frames and far-side handlers — subplan 4 now delivers both the wire operations and the far-side handlers and decoders in one slice.

## Goal

Make the four new commands work on a remote tab by adding caller-side port methods for the five operations and routing each executor through one remote filesystem session. No dispatcher, completion, native command, or agent wiring is part of this subplan.

## Design decisions

- A remote tab resolves paths only inside its remote workspace, never on the local disk. `localReadRoot` at `src/file-read/tab-read.ts:7` already returns `undefined` for a remote tab; each executor takes that branch instead of a local-root branch.
- Add one caller-side helper per operation beside `remoteReadLines` in `src/file-navigator/remote/port-reads.ts:20`, taking `(request, paths, root, relPath, …args)` as `remoteReadLines` does. Answer an absolute `relPath` locally with the same `Outside the workspace` line, map the path with `paths.to(root, relPath)`, send the operation with `request('operation', { path: sent, …args })`, and return `{ text, path }` from the decoded result. Add a thin delegating method to `RemoteFileSystemPort` at `src/file-navigator/remote/port.ts:37`, beside `readLines` at line 126 and `globPaths` at line 130. The helpers belong in `port-reads.ts`, which already exists to keep `port.ts` under the 200-line limit (see its comment at lines 11-13); keep the `port.ts` edits to thin delegates.
- Each executor opens one remote session per call through `withRemoteTabPort` at `src/file-read/remote-tab-port.ts:8`, passing a distinct prefix per command as `readRemoteFile` at `src/file-read/tab-read.ts:28` passes `'file-read'`. The callback receives `(port, workspace)`; pass `workspace` as `root` to the new port methods. The far side already answers with finished output text (subplan 4), so the executor returns `result.text` directly rather than formatting it locally; this is what keeps local and remote wording from drifting. A missing channel, readiness, or workspace yields the existing `REMOTE_UNAVAILABLE` line from `remote-tab-port.ts:4`.
- Each operation is read-only and stays inside the remote workspace; the local executor's root resolution and the far side's containment checks share the decision, and no path is ever resolved against the local disk on a remote tab.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `withRemoteTabPort` | `src/file-read/remote-tab-port.ts:8` (one session per command call, remote-unavailable handling) |
| Remote read precedent | `remoteReadLines` at `src/file-navigator/remote/port-reads.ts:20`; `remoteGlobPaths` at line 37 |
| Remote port interface | `src/file-navigator/remote/port.ts` |
| Remote executor precedent | `readRemoteFile` in `src/file-read/tab-read.ts:27-36` |
| Local-root discriminator | `localReadRoot` at `src/file-read/tab-read.ts:7` |
| Frames and far-side handlers | subplan 4 |
| Fake remote channel harness | `src/commands/file.test.ts` |

## Proposed changes

- Add caller-side methods for `list-directory`, `stat-path`, `path-exists`, `head-lines`, and `tail-lines` beside `remoteReadLines`, and declare them on the remote filesystem port.
- Extend the `file-list`, `file-stat`, `file-exists`, and `file-head-tail` executors from subplans 1-3 with a remote branch that calls `withRemoteTabPort` and returns the operation's finished text. Keep the local branch unchanged.

## Tests

- Port method tests alongside `src/file-navigator/remote/port-reads.test.ts` (or its current home): each new method sends the right operation and arguments and returns the decoded text; a channel refusal surfaces the existing remote-unavailable behavior.
- Executor tests using the fake remote channel harness from `src/commands/file.test.ts`: run each command on a remote tab and assert the returned output text matches the local executor's wording for the same fixture, including a directory row, `(empty directory)`, each `exists` word, head numbering, tail absolute numbering, `notdir`, and an out-of-workspace or secret refusal.
- Assert a remote tab never consults the local temporary directory used by the local-root tests.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. The dispatcher entry arrives in subplan 7, so drive the executors directly through the fake remote harness here.

## Out of scope

The ordered dispatcher chain and completion (subplan 7); native command vocabulary, settings rows, roles, primers, the agent gate, and the workspace runner (subplan 8); help, specs, and manual end-to-end checks (subplan 9). Do not change `file read`, `file glob`, or `file grep` remote behavior.
