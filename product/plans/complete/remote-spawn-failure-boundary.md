# Contain a failed process spawn inside the remote server

## Complexity

3/10. Two source modules change by a few lines each (`src/remote/serve.ts`, `src/remote/serve-processes.ts`), both reusing paths that already exist: the `exit` frame the local side already understands, the detached peer's existing `exit` handling, and `RemoteProcesses.finish`. No protocol change, so `REMOTE_PROTOCOL_VERSION` does not move.

## Goal

`janus remote-serve` has no failure boundary around a spawn. `RemoteProcesses.spawnPty` deliberately rethrows after releasing the browser it started, `RemoteServer.spawn` does not catch, and nothing between the stdin `data` handler and the spawn does either, so a PTY that will not start throws to the top of the process. `RemoteProcesses.spawnPipe` never listens for the child's `'error'` event, so an asynchronous spawn failure (a missing or unexecutable `$SHELL`) is an unhandled `'error'` that also kills the process.

Either way `remote-serve` dies without `shutdown()`: no `exit` frame reaches the requesting tab, running processes are not killed, the clone and the parked-peer record stay on disk, and the local reconnect finds a dead pid and ends every tab sharing that channel.

After this change a failed spawn surfaces as that one process exiting with code 1, and the server keeps answering every other frame.

## Approach

- `RemoteServer.spawn` wraps `this.processes?.spawn(frame)` in try/catch. On a throw it emits `{ type: 'exit', id: frame.id, exitCode: 1 }` and returns before following the harness transcript, since there is no process to follow. `emit` feeds the detached peer too, whose `exit` handling in `src/remote/serve-detach.ts` already drops the pipe id and history that `this.peer?.track(frame)` recorded a line earlier.
- `RemoteProcesses.spawnPipe` adds an `'error'` listener that ends the entry through the existing `finish(id, 1)`. Node may or may not emit `'exit'` after `'error'`, so the pipe's `error` and `exit` handlers share a local `ended` flag and only the first of them calls `finish`, keeping one `exit` frame per process. `finish` itself is not guarded: the PTY path and `killAll` rely on its current unconditional behavior.
- `spawnPty` keeps its rethrow. Its contract, pinned by `src/remote/serve-processes-browser.test.ts` ("when the PTY fails to start"), is that the caller handles the throw, and this change makes the caller do so.

Rejected: a general per-frame try/catch around `dispatch`. It would also cover frame types that have no process id to report an exit against, and choosing what each of those should answer is a larger design question. The item is scoped to spawn.

## Implementation steps

1. `src/remote/serve-processes.ts`: in `spawnPipe`, add the shared `ended` flag, route `exit` through it, and add `shell.on('error', ...)` calling `finish(id, 1)` through the same guard. A short comment states why the guard exists (Node may emit `'exit'` after `'error'`).
2. `src/remote/serve.ts`: in `spawn`, wrap the process spawn in try/catch, emit the `exit` frame on failure, and skip `followTranscript`. A short comment states that a failed spawn is the process's failure, not the session's, and that the exit also clears what the peer tracked.
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/remote/serve.test.ts`: after provisioning, make the mocked `spawnPty` throw for one spawn frame; assert an `exit` frame with `exitCode: 1` for that id, that the server did not exit, and that a following `session-state` request is still answered with no entry for the failed id.
- `src/remote/serve-processes.test.ts`: a persistent shell whose child emits `'error'` sends one `exit` frame with code 1 and is dropped from `states()`; when the child then also emits `'exit'`, no second `exit` frame is sent.

## Out of scope

- Reporting the spawn error text to the tab rather than only an exit code.
- A general per-frame failure boundary in `RemoteServer.dispatch` for the other frame handlers.

## Documentation and specification impact

`product/specs/remote-server.md` gains a sentence beside the existing "An ACP-level failure is not a channel-level fault" paragraph: a process that fails to start on the remote host is reported as that process exiting with code 1, and the channel and every other process sharing it keep running. `help.md` and `documentation/user-documentation/` do not describe remote spawn failures and are left alone.
