# End a live instance when the sandbox denies the stop signal

**Complexity: 5/10** — 12 requirements, 8 test scenarios, ~70 added lines across 2 edited production files (p=5.638)

## Goal

`janus stop` must end a live instance even when the sandbox refuses SIGTERM to the detached server. The work item's Step D11 expects that after `janus stop <project-dir>` "the address is no longer reachable, `latest.log` still names the last run's file, and that file still holds its `__JANUS_URL__` line." Today stop reaches `process.kill(pid, 'SIGTERM')`, the OS answers `EPERM`, and `boot()`'s catch prints `failed to start: kill EPERM` while the server keeps answering. The fix adds a permission-free local fallback: a stop request under the target project's `.janissary/` that the running server notices and answers through its own existing graceful shutdown path. The bare-pid lock, the exact already-running and no-running messages, and the foreign-owner takeover stay unchanged.

## Requirements

1. When the lock names a live instance and the sandbox denies `process.kill(pid, 'SIGTERM')` with `EPERM`, `janus stop` ends that instance instead of exiting 1 ("Existing Issue: `janus stop` exits 1 with `kill EPERM` against a live instance and leaves that instance still answering on its address").
2. The fallback is a stop request written under the target project's own `.janissary/` ("write a stop-request sentinel under the target `.janissary/`").
3. The stop request names the recorded pid so it applies to that instance ("if practical, the recorded pid").
4. The running server notices the stop request and answers by invoking its own existing graceful shutdown path ("the running server notices and answers by invoking its own existing graceful shutdown path").
5. A stop request cannot end a server in another project ("so one project's stop cannot end another's server").
6. A leftover stop request does not affect a later launch ("Remove or clear the sentinel appropriately so a later launch is not affected").
7. SIGTERM remains the primary path when the OS permits it ("while preserving the documented SIGTERM path"; `product/specs/cli.md:89`).
8. A positively foreign pid still prints the no-running message and receives no shutdown ("assert a positively foreign pid still gets the no-running message and no shutdown").
9. A missing lock, an invalid pid, or a dead pid still prints exactly `no running janus instance for <dir>` and exits 0 ("it prints `no running janus instance for <dir>` and exits 0 (there being nothing to stop is not an error)" — `product/specs/cli.md:89`).
10. The lock file keeps holding a bare pid ("Keep the bare-pid lock file").
11. No network or authentication surface changes ("do not widen any network or auth surface").
12. The shutdown sequence triggered by the fallback is the same one SIGTERM triggers ("triggering the same graceful shutdown sequence above" — `product/specs/cli.md:89`; `product/specs/cli.md:78-85`).

## Design decisions

- Only `EPERM` from `process.kill` selects the fallback. Every other error still propagates to the existing startup-error banner, so a genuinely broken signal path is not hidden.
- The stop request is an ordinary file, `.janissary/stop-request`, in the target directory. There is no socket, HTTP route, RPC method, or new token, so the local-first security boundary is untouched (Requirement 11).
- The file's content is the locked pid with a trailing newline. Because only the server rooted in that directory watches that path, and it acts only when the content equals its own `process.pid`, a request from one project cannot end another's server (Requirement 5).
- The server polls the file on a short unref'd interval. An unref'd interval does not hold the process open and is already the pattern used by `ResumeWatch` (`src/resume-watch.ts:10-14`). A 200 ms tick keeps the work item's 1.5-second observation window comfortable.
- The watcher removes the file before it calls back. It removes a request naming any other pid too, so a request left behind by a server that died before noticing it cannot stop a later instance (Requirement 6).
- A successful launch also clears any leftover stop request right after taking the lock. A request naming a recycled pid can therefore never greet a fresh server, even before its first poll (Requirement 6).
- `atomicWriteFile` writes the request through a temporary file and rename, so the poller never reads a half-written pid (`src/atomic-write.ts:8-19`).
- The fallback reuses `server.shutdown()` from `src/index.ts`. No second shutdown implementation is introduced (Requirement 12).

## Preserved behavior

1. With signalling permitted, `janus stop` sends SIGTERM to the live locked pid; it must not write a stop request instead. Test: `src/stop-instance.test.ts` "signals SIGTERM to a live locked pid".
2. With no lock file, `janus stop` prints `no running janus instance for <dir>`; it must not write a stop request. Test: `src/stop-instance.test.ts` "reports no running instance when no lock file exists".
3. With a pid positively owned by another account, `janus stop` prints the no-running message and sends no SIGTERM; it must not write a stop request either. Test: `src/stop-instance.test.ts` "reports no running instance when the locked pid belongs to another account".
4. When the probe is denied and the owner is unreadable, `janus stop` still signals the recorded pid; it must not print the no-running message. Test: `src/stop-instance.test.ts` "signals the locked pid when the probe is denied and the owner query is unavailable".
5. An empty lock sends no signal and prints the no-running message; it must not write a stop request. Test: `src/stop-instance.test.ts` "reports no running instance for an empty lock file without signalling anything".
6. A dead pid prints the no-running message; it must not write a stop request. Test: `src/stop-instance.test.ts` "reports no running instance when the locked pid is dead".
7. A live lock held by this account still refuses a second launch with the already-running message; the new stop request must not change lock arbitration. Test: `src/instance-lock.test.ts` "throws when a second call targets a directory already locked by a live pid".

## Assumptions

1. `stopInstance` reaches `process.kill(pid, 'SIGTERM')` only after `isOwnInstanceAlive(pid)` answers true (`src/stop-instance.ts:6-12`).
2. The server registers a SIGTERM handler that calls `server.shutdown()` (`src/main.ts:93-95`), and `shutdown()` is the same `requestExit()` the `quit` command uses (`src/index.ts:128-134`).
3. The server is spawned detached, so the stop command is not its parent and the sandbox denies a cross-process signal (`bin/janus.mjs:120`; `src/sandbox/profile.ts:185-191`).
4. `atomicWriteFile` creates a temporary file then renames it, so a concurrent read sees either no file or the complete pid (`src/atomic-write.ts:8-19`).
5. `acquireLock` is called once before the server starts, and the `stop` branch returns before it (`src/main.ts:64` and `:71`), so clearing a leftover request on launch cannot interfere with stopping an already-running instance.
6. The launcher keeps the per-run log and `latest.log` link untouched by a server-side shutdown because only the launcher repoints the link, before the server exits (`bin/janus.mjs:123-128`).

## Existing functionality

1. The graceful shutdown path itself, `shutdown: () => requestExit()` on the running server (`src/index.ts:134`).
2. The write-then-rename helper that makes a small watched file safe to poll (`src/atomic-write.ts:8` `atomicWriteFile`).
3. The bare-pid lock file reader the stop command already uses (`src/instance-lock.ts:63` `readLockPid`; `src/pid-lock-file.ts:21` `readPidFile`).
4. The fail-closed owner check that lets stop identify a live instance when signalling is denied (`src/instance-lock.ts:46` `isOwnInstanceAlive`).
5. The unref'd `setInterval` lifecycle used by the resume watch (`src/resume-watch.ts:10-14`).
6. The `vi.spyOn(process, 'kill')` and temp-project test pattern in `src/stop-instance.test.ts:17-28`.
7. The stop section and shutdown-trigger list the spec already maintains (`product/specs/cli.md:78-89`).

## Implementation steps

1. **Stop-request module.** Add `src/stop-request.ts` exporting `stopRequestPath(projectDir)`, `writeStopRequest(projectDir, pid)`, `clearStopRequest(projectDir)`, and `watchStopRequest(projectDir, onStop)`. The path is `path.join(projectDir, '.janissary', 'stop-request')`. Writing creates `.janissary/` recursively and uses `atomicWriteFile` with a newline-terminated pid. Clearing removes the file with `rmSync(..., { force: true })`. Watching starts a 200 ms `setInterval`, reads the file, removes it whatever it says, calls `onStop()` only when the content parses to `process.pid`, unrefs the timer, and returns a function that clears it. Add a short comment naming the sandbox reason. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Stop command fallback.** In `src/stop-instance.ts`, import `writeStopRequest` and wrap the existing `process.kill(pid, 'SIGTERM')` in a `try`/`catch`. On `EPERM`, write the stop request for that pid and return without printing anything; on any other error, rethrow. Leave the `pid !== undefined && isOwnInstanceAlive(pid)` guard, the no-running message, and the bare-pid read untouched. Extend the top comment to describe the fallback. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Boot wiring.** In `src/main.ts`, import `clearStopRequest` and `watchStopRequest`. Clear any leftover stop request immediately after `acquireLock(cwd)`. After registering the SIGINT and SIGTERM handlers, start `watchStopRequest(cwd, stop)` and keep its returned function; the process `exit` handler calls that function before the existing `killApp()`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Tests.** Add `src/stop-request.test.ts` with fake timers covering the write path and content, clearing, a matching request triggering shutdown and being removed, a foreign or unreadable request being cleared without shutdown, no request doing nothing, and the watcher's returned function ending polling. Extend `src/stop-instance.test.ts` with an `EPERM` case that asserts a stop request naming the locked pid and no no-running message, and strengthen the foreign-pid case with an assertion that no stop request appears. Build command: `$janissary/scripts/run.mjs check-diff`.
5. **Spec.** Update `product/specs/cli.md`: add the stop request to the shutdown triggers and describe it in "Stopping a running instance", keeping the SIGTERM sentence and the exact `no running janus instance for <dir>` message. No `help/` page describes the signal mechanism, and no command, flag, or binding changes, so no help edit. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change stays in the CLI stop path and the server's shutdown wiring; no command, flag, key binding, or visible UI changes.

## Tests

- `src/stop-instance.test.ts`: an `EPERM` kill still ends the instance through a stop request naming the locked pid and prints nothing (Requirements 1, 2, 3, 7); a foreign pid prints the no-running message with no signal and no stop request (Requirement 8). Existing cases keep pinning Requirements 7, 9, and 10.
- `src/stop-request.test.ts`: the request lives under the target directory's `.janissary/` and holds the pid (Requirements 2, 3, 5); a matching request triggers the server's callback and is removed (Requirements 4, 6); a request naming another pid is removed without triggering (Requirements 5, 6); an unreadable request is removed without triggering (Requirement 6); no request triggers nothing; stopping the watcher ends polling (Requirement 6).
- Existing `src/index.test.ts` shutdown cases keep pinning that `shutdown()` follows the graceful path the fallback reuses (Requirement 12).

## Out of scope

- No socket, HTTP route, RPC method, token, or bind-address change (Requirement 11).
- No change to the lock file format, lock arbitration, or `isOwnInstanceAlive` and `pidBelongsToCurrentUser`.
- No change to `bin/janus.mjs`, `bin/server-log.mjs`, log naming, sweeping, or the `latest.log` link.
- No help page edit and no `documentation/user-documentation/` or `documentation/developer-documentation/` edits.
- No PR description correction: the work item quotes the existing How to verify step, which already states the behavior this fix delivers.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Stop after a denied signal.** In a scratch project with `.janissary/config.json` holding `{"logEnabled": false, "logRetentionInDays": 7}`, run `node bin/janus.mjs --no-open <scratch>`, read the address from `<scratch>/.janissary/logs/server/latest.log`, and record the pid in `<scratch>/.janissary/lock`. Run `node bin/janus.mjs stop <scratch>`. After 1.5 seconds the address must refuse a connection, the lock must be gone, `readlink latest.log` must still name the same file, and that file must still hold its `__JANUS_URL__` line. Failure looks like the old `failed to start: kill EPERM` and an address that still answers HTTP 200.
3. **Scope and cleanup.** Start a second project's server, write a stop request naming only the first project's pid, and confirm the second server keeps answering. Then launch the first project again and confirm the fresh instance stays up past one poll with no leftover stop request.
4. **Foreign pid.** Write a lock naming a pid owned by another account, run `janus stop`, and expect `no running janus instance for <dir>` with no stop request written and no server stopped.
