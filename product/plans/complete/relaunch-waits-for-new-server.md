# Make janus --relaunch wait for the server it just started

**Complexity: 2/10**. One change to the readiness wait in `bin/janus.mjs`, plus a launcher test. The server already writes the right marker and the right failure banner.

## Root cause

The launcher opens `.janissary/log/server.log` with `w` for a normal launch and `a` under `--relaunch`, then hands the descriptor to the detached server. `awaitReady` polls the whole log every 100 ms and resolves on the first line starting with `__JANUS_URL__`. Under `--relaunch` the log still holds an earlier run's marker, so the first poll finds it before the new server has written anything. The launcher prints that old address under `--no-open` and exits 0. Once `finish` has settled, the child's later `exit` is ignored, so a failed start never reaches the terminal or the exit code.

Taking the last marker instead would still race the new server, which hasn't written its marker when the first poll runs.

## Correct behavior

`product/specs/cli.md`, Startup sequence: the launcher watches the log for the `__JANUS_URL__` line and exits 0 once it appears, printing the URL under `--no-open`. If the server exits before that line appears, the launcher relays the tail of the log and exits with the server's own exit code. The log is appended to under `--relaunch`. So under `--relaunch` the launcher must wait for the marker the new server writes, print the new server's URL, and relay a failed start with the server's exit code, just as a normal launch does.

## Reproduction

New test `scripts/janus-launcher-relaunch.test.mjs`, which seeds a scratch project's `.janissary/log/server.log` with `__JANUS_URL__ http://127.0.0.1:1/?token=stale` and runs `bin/janus.mjs --no-open --relaunch` against it:

- With a test listener holding the requested port (`--port=<held>`), the launcher printed `http://127.0.0.1:1/?token=stale` and exited 0. The server's failed-to-start banner never reached stderr.
- With no port conflict, the launcher printed the same stale address and exited 0, though a new server had started on a different port.

## Approach

Right after opening the log, record its size with `fstatSync(logFd).size`. That's 0 for a normal launch, since `w` truncates. `awaitReady` reads only the bytes after that offset, so it finds only the marker the new server writes. When the server exits first, the launcher relays the tail of that same slice, which holds the new run's failure banner rather than an earlier run's output.

If the file is now shorter than the offset (another normal launch truncated it underneath), the slice is empty and counts as "no new marker yet". The launcher keeps waiting for the child to write its marker or exit.

Rejected: taking the last marker in the file. It races the new server exactly as the first marker does.

## Implementation steps

1. `bin/read-log-since.mjs`: a `readLogSince(logPath, offset)` helper that returns the log's content after the offset, empty when the file is missing or shorter. It gets its own module so the offset handling can be unit-tested without starting a server.
2. `bin/janus.mjs`: import `fstatSync` and the helper, record `logStart` after `openSync`, and use the helper in `awaitReady`'s poll and in the exit-path tail.
3. `scripts/janus-launcher-relaunch.test.mjs`: the failed-relaunch launcher case and the `readLogSince` unit cases.

## Regression test

`scripts/janus-launcher-relaunch.test.mjs`:

- "relays a failed start instead of reporting the previous run's address" holds the requested port and asserts no stale address on stdout or stderr, `failed to start` on stderr, and exit 1. Without a built web bundle (CI) the server fails on the missing bundle instead of the port, and the assertions hold either way. Against the unfixed launcher it failed: stdout was `http://127.0.0.1:1/?token=stale`.
- `readLogSince` cases: only what was appended after the offset is returned, nothing when no new output exists yet, nothing when the log was truncated below the offset, and nothing when the log is missing.

A successful relaunch isn't run end to end in the suite. An earlier draft of the test did that and asserted a fresh address. Its server outlived the test here, because this environment denies signals to the detached server, so `janus stop` in the teardown couldn't reach it. The live check covers the successful path instead.

## Verification

Run `./scripts/run.mjs check-diff`. Live: this is a CLI invocation, so the live check runs the checkout's own `bin/janus.mjs` (after `npm run build`) from a scratch working directory under `./temp/fix-a-bug/` with a scratch `HOME`. It launches `--no-open work` (instance A), then, with A running, `--no-open --relaunch --port=<A's port> work`, then `--no-open --relaunch work`. Expected: the conflicting relaunch prints the `port … is already in use` banner and exits 1. The successful relaunch prints its own new address, not A's. A browser driver then connects to the newest instance and to A, so both exit when it disconnects.

Outcome: verified. Instance A came up on port 49672. The conflicting relaunch printed `janissary 0.15.0 — failed to start: port 49672 is already in use.` with its guidance and exited 1. The successful relaunch printed `http://127.0.0.1:49674/?token=…` and exited 0, though the log's first `__JANUS_URL__` line still named 49672. The driver found the log's markers at 49672 and 49674, loaded the app at 49674 (the address the launcher reported), then at 49672. Both instances exited on their own after the driver disconnected. The stop task found `no running janus instance`.

## Spec and docs

`product/specs/cli.md`, Startup sequence: the launcher now watches for the line written by the server it just started, ignores what the log already held under `--relaunch`, and relays only that server's output on failure. `documentation/user-documentation/getting-started/startup.md`, Troubleshooting: a failed launch prints the tail of what that launch wrote, never an earlier run's output. `help.md` doesn't describe the launcher's readiness wait.

## Out of scope

- The instance lock's liveness probe and how a sandbox affects it.
- Truncation of the log by a concurrent normal launch beyond treating it as "no new marker yet".
- `scripts/docs-screenshots/janus.mjs` and `scripts/e2e/session.mjs`, which read the marker their own way.
