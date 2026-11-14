# Stop a running file glob walk when its ACP prompt is cancelled

**Complexity: 3/10** — ~14 added lines, 6 files, 4 requirements, 5 test scenarios (p=4.80)

`runWorkspace` in `src/acp/run-prompt.ts` checks `active()` only before it calls `globFilesInTab`. Neither `globWorkspace` nor `walkGlob` takes a cancellation signal, so a cancelled agent glob keeps reading directories and matching until its limit or its 30-second deadline, and its result is then thrown away. The far-side loop in `src/remote/serve-acp-loop.ts` has the same gap through `globWorkspaceCommand`.

## Goal

A file glob run by an ACP prompt stops walking at the next directory read after the prompt is cancelled, and a git ignored-set lookup still running at cancel is killed. Typed `file glob` passes no signal and behaves exactly as today.

## Approach

Reuse the existing cancellation mechanism: the prompt's `request.abort` controller, whose signal `active()` already reflects and which `cancel` in `src/acp/manager.ts` and `settleAcpPrompt` abort. On the far side, reuse the run's `controller.signal` in `startRemoteLoop`. Thread an optional `AbortSignal` from those callers through `globFilesInTab` / `globWorkspaceCommand` into `globWorkspace`, which hands it to `loadIgnoredPaths` (as `execFile`'s `signal` option) and to `walkGlob` (as `GlobWalkOptions.signal`).

`walkDirectory` checks `signal?.aborted` beside the deadline check and sets `stopped` without `timedOut`. A lookup aborted by the signal resolves `undefined`, so `globWorkspace` returns without walking; the text it would print is discarded by the cancelled runner. All touched files stay well under 200 lint-counted lines.

## Implementation steps

1. `src/file-glob/walk.ts`: add `signal?: AbortSignal` to `GlobWalkOptions`; in `walkDirectory`, after the `stopped` check, set `stopped` and return when the signal is aborted.
2. `src/file-glob/ignored.ts`: accept an optional `signal`, pass it to `execFile`, and resolve `undefined` in the catch when it is aborted.
3. `src/file-glob/glob.ts`: give `globWorkspace` and `globWorkspaceCommand` an optional trailing `signal` and pass it to `loadIgnoredPaths` and `walkGlob`.
4. `src/file-glob/tab-glob.ts`: give `globFilesInTab` an optional trailing `signal` and pass it to `globWorkspace` for local roots.
5. `src/acp/run-prompt.ts`: pass `request.abort.signal` to `globFilesInTab`.
6. `src/remote/serve-acp-loop.ts`: pass `controller.signal` to `globWorkspaceCommand`.

## Tests

- `src/file-glob/walk.test.ts`: a walk whose signal is aborted after the first `readdir` (via the existing `readdir` spy) reads no further directory and reports `timedOut: false`; a walk with an already-aborted signal reads no directory.
- `src/file-glob/ignored.test.ts`: aborting the signal while a stubbed git hangs resolves `undefined` promptly.
- `src/acp/run-prompt.test.ts`: the granted-glob routing test asserts the prompt's abort signal is passed; cancelling while a glob is pending aborts the signal handed to `globFilesInTab`.
- Typed `file glob` callers (`src/commands/file.ts`, `glob-paths-operation.ts`) are unchanged; existing walk, glob, and tab-glob tests keep passing.

## Spec

`product/specs/acp.md` (file glob): state that cancelling the prompt stops a running agent glob.

## Out of scope

- Cancelling a glob already forwarded to a remote tab's filesystem port (`globRemotePaths`); that request has no cancellation channel.
- Moving the walk off the main loop.
