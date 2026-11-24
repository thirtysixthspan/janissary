# Write a per-run localhost-and-timestamp server log from the launcher

**Complexity: 5/10** — 13 requirements, 8 scenarios, ~25 added production lines (p=5.28)

## Goal

Stop the launcher from truncating one shared server log at every launch. Each background local server launch, including one whose child exits before readiness, gets its own file under `.janissary/logs/server/`, named after `localhost` and the UTC launch time. The launcher reads readiness and failure output only from that file. This subplan does not create the `latest.log` link yet; subplan 3 depends on this work and adds it once the per-run log exists. Source: `./product/plans/complete/server-log-per-run.md`. No dependency on earlier subplans.

## Requirements

1. "Each local run writes its server output to a new file under `.janissary/logs/server/`" ("update server.log to be created for each run", "stored in ./janissary/logs/server/"). [Source R1]
2. "The file's name carries the host name and a timestamp" ("logs should be named after the host name and a timestamp in the name"). [Source R2]
3. "The host name in a local server log's name is always `localhost`" ("host name should be `localhost` for the main machine"; user answer: "focus only on local logs"). [Source R3]
4. "A server log's name is the host name followed by the UTC ISO launch time with `:` and `.` replaced by `-`, ending `.log`, e.g. `localhost-2026-11-23T15-04-05-123Z.log`" (user answer: "Artifact shape"). [Source R4]
5. "An existing `.janissary/logs/server.log` is never written, moved, or reaped" (user answer: "Leave it"). [Source R6]
6. "Server logs are written whether `logEnabled` is true or false" (user answer: "Not gated"). [Source R7]
7. "A launch that fails, including one refused by the instance lock or a usage error, keeps its own log in `.janissary/logs/server/`" (user answer: "Keep it"). [Source R9]
8. "When the server exits before readiness, the launcher relays the tail of that run's own log to the terminal" (user answer: "Keep it"). [Source R10, R18]
9. "A failed launch never writes to or truncates the log of the instance already running" (user answer: "Keep it"). [Source R11]
10. "The launcher takes readiness only from a `__JANUS_URL__` line in the new run's own log, never from a line in another run's log" (user answer: "Launcher contract"). [Source R17]
11. "When the server exits before readiness, the launcher exits with that server's own exit code" (user answer: "Launcher contract"). [Source R18]
12. "Under `--no-open`, the launcher still prints the new server's URL on its own line to stdout" (user answer: "Launcher contract"). [Source R19]
13. "A filename collision never causes one run's log to replace another run's log" ("update server.log to be created for each run"). [Source R1]

## Design decisions

- Add `bin/server-log.mjs` beside `bin/read-log-since.mjs:6`, following the precedent of a launcher-side `.mjs` helper with its test under `scripts/`. It exports `serverLogFilename(timestamp)` in this subplan; subplan 3 will add the `latest.log` helper to the same module. A comment names `harnessArtifactFilename` in `src/harness/artifact-name.ts:8` as the shape mirrored (Assumption 12), the way `bin/janus.mjs:43` names `URL_MARKER`. The shape cannot be imported from TypeScript across the `.mjs`/`.ts` boundary.
- The name is a literal `localhost` prefix plus the UTC ISO string with `:` and `.` replaced by `-`, ending `.log`. No configured host name or network-name fallback appears here; local logs only.
- `logDir` becomes `<project-dir>/.janissary/logs/server`, relying on the existing recursive `mkdirSync` at `bin/janus.mjs:103` to create it (Assumption 1). The missing-project guard stays ahead of this work (Assumption 7).
- Create the run's log exclusively with `openSync(logPath, 'wx')`. Start from `serverLogFilename(Date.now())`; on `EEXIST` only, advance the candidate timestamp by one millisecond, rebuild the name, and retry. Any other open error propagates as an open failure does today. This follows the exclusive-create precedent in `src/pid-lock-file.ts:12` and `:16`, keeps the required name shape, and prevents a same-millisecond launch from truncating another run's file (Assumptions 2, 3; Requirement 13).
- `logStart` reads the file size after `openSync(..., 'w')` has already truncated it, so it is always `0` today; it does not preserve prior bytes (Assumption 3). A per-run file is empty before the child starts, so delete `logStart`, remove the now-unused `fstatSync` import, and pass `0` to `awaitReady` and to the exit path's `readLogSince` (Assumptions 4, 5).
- The marker scan stays in `awaitReady`. With an exclusively created file and offset `0`, it can only find the marker written by this launch's child (Assumptions 4, 8, 11; Requirement 10).
- The child-exit path tails this run's file and exits with the child's code. The `--no-open` success path still prints the URL on its own stdout line (Assumptions 5, 6, 8). Nothing in the launcher reads `logEnabled`; log creation happens before the server loads project config (Assumptions 8, 10; Requirement 6).
- The existing foreground guard at `bin/janus.mjs:41` remains before log setup, so `stop`, `init`, `remote-serve`, `--help`, and `--version` do not reach the per-run log path (Assumption 7).

## Preserved behavior

1. A launch whose project path is missing or names a regular file runs the server attached, exits 2 with the usage error, and creates no `.janissary/` tree at or beside that path. Negative assertion: the missing path stays absent, and the regular-file case leaves only the original file in its parent directory. Existing pin: `scripts/janus-launcher.test.mjs` "reports a path that does not exist as a usage error, exits 2, and does not create it".

## Assumptions

1. The launcher's background branch creates its current log directory recursively: `bin/janus.mjs:102` `const logDir = path.join(projectDir, '.janissary', 'logs');` and `bin/janus.mjs:103` `mkdirSync(logDir, { recursive: true });`.
2. The launcher opens one fixed shared log in truncating mode: `bin/janus.mjs:104` `const logPath = path.join(logDir, 'server.log');` and `bin/janus.mjs:105` `const logFd = openSync(logPath, 'w');`.
3. The launcher records the size only after that truncating open: `bin/janus.mjs:106` `const logStart = fstatSync(logFd).size;`, so the recorded offset is `0`.
4. `awaitReady` scans one supplied file from a supplied offset for the first readiness marker: `bin/janus.mjs:81` `function awaitReady(logPath, offset, child)`, `bin/janus.mjs:87` `const content = readLogSince(logPath, offset);`, and `bin/janus.mjs:88` `content.split('\n').find((candidate) => candidate.startsWith(URL_MARKER));`.
5. The current offset feeds both readiness and the child-exit tail: `bin/janus.mjs:111` `const url = await awaitReady(logPath, logStart, child);` and `bin/janus.mjs:117` `process.stderr.write(tail(readLogSince(logPath, logStart)));`.
6. The `--no-open` URL print is one stdout line: `bin/janus.mjs:113` `if (arguments_.includes('--no-open')) process.stdout.write(`${url}\n`);`.
7. The project-directory guard precedes all log setup: `bin/janus.mjs:101` `if (!isDirectory(projectDir)) runAttached();`. The foreground guard also runs earlier at `bin/janus.mjs:41` `if (isForeground) runAttached();`.
8. The child is spawned only after its log file is open, with both output streams redirected to that descriptor: `bin/janus.mjs:108` `spawn(command, commandArguments, { detached: true, stdio: ['ignore', logFd, logFd] })`.
9. A live instance's lock makes a second launch fail inside the server: `src/instance-lock.ts:82` `if (pid !== undefined && isOwnInstanceAlive(pid)) throw alreadyRunning(file, pid);`.
10. The server takes the lock after the launcher has spawned it: `src/main.ts:71` `acquireLock(cwd);`.
11. The server writes the readiness marker only after startup succeeds: `src/main.ts:89` `process.stdout.write(`__JANUS_URL__ ${server.url}\n`);`.
12. The existing artifact-name helper supplies the UTC ISO transform to mirror: `src/harness/artifact-name.ts:10` `const stamp = new Date(timestamp).toISOString().replaceAll(/[:.]/g, '-');`.
13. The existing log-location test asserts the old fixed path: `scripts/janus-launcher.test.mjs:53` "writes the server log to .janissary/logs, not .janissary/log".
14. A copied launcher resolves its root from its own directory and prefers a compiled entry there: `bin/janus.mjs:12` `const root = path.join(import.meta.dirname, '..');` and `bin/janus.mjs:19` `if (existsSync(compiled)) {`.

## Existing functionality

1. The launcher-side log reader and its script test, `bin/read-log-since.mjs:6` `readLogSince` and `scripts/read-log-since.test.mjs`.
2. The cross-boundary constant comment, `bin/janus.mjs:43` naming `src/main.ts`'s `__JANUS_URL__` line and `URL_MARKER`.
3. The artifact filename shape, `harnessArtifactFilename` in `src/harness/artifact-name.ts:8`.
4. The scratch-directory test setup, `scripts/read-log-since.test.mjs:13` with `beforeEach`/`afterEach` around `mkdtempSync`.
5. The launcher failure-test helper, `scripts/janus-launcher.test.mjs:14` `function launch(...args)` and its `launch('--bogus', scratch)` call at `:56`.
6. The readiness marker writer, `src/main.ts:89` `__JANUS_URL__ ${server.url}`.
7. Exclusive file creation with an `EEXIST` retry boundary, `src/pid-lock-file.ts:12` `writeFileSync(file, String(process.pid), { flag: 'wx' })` and `:16` `if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;`.
8. The launcher's compiled-entry selection, `bin/janus.mjs:19` `if (existsSync(compiled)) {`, which lets an isolated test supply a fake `dist/main.js`.

## Implementation steps

1. **Add the filename helper and its unit test.** Create `bin/server-log.mjs` beside `bin/read-log-since.mjs` with a comment naming `harnessArtifactFilename` at `src/harness/artifact-name.ts:8` as the shape it mirrors. Define one export, `serverLogFilename(timestamp)`: it returns `localhost-` followed by the UTC ISO form of the timestamp with every `:` and `.` replaced by `-`, then `.log`. Add `scripts/server-log.test.mjs` beside `scripts/read-log-since.test.mjs` with a direct import and one case "names a log localhost followed by the ISO timestamp" asserting `localhost-2026-11-23T15-04-05-123Z.log` for that UTC instant (Requirements 2, 3, 4). This pure function needs no filesystem fixture. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Point the launcher at a fresh per-run log and update its failure test in the same checkpoint.** In `bin/janus.mjs`, import `serverLogFilename` from `./server-log.mjs`, set `logDir` to `path.join(projectDir, '.janissary', 'logs', 'server')`, and keep the recursive `mkdirSync` immediately after it. Build the first candidate from `serverLogFilename(Date.now())`, then create it with `openSync(logPath, 'wx')`; on `EEXIST`, advance the candidate timestamp by one millisecond and retry, and rethrow every other error. Keep the `spawn` call and its file descriptors unchanged. Remove the `fstatSync` import and the `logStart` declaration; pass `0` as the offset to `awaitReady` and to the exit path's `readLogSince`. Keep the marker scan, the 200-line tail, the child exit code, and the `--no-open` URL print as they are (Requirements 1, 5, 6, 7, 8, 9, 10, 11, 12, 13). In the same step, replace "writes the server log to .janissary/logs, not .janissary/log" in `scripts/janus-launcher.test.mjs` with "writes a failed launch's log under .janissary/logs/server and relays its tail": pre-seed `.janissary/logs/server.log` with sentinel bytes, launch with `--bogus`, and assert exit 2, stderr containing `Unknown option '--bogus'`, exactly one `localhost-*.log` directly under `.janissary/logs/server/` holding that text, the seeded legacy file byte-for-byte unchanged, no `.janissary/log/server.log`, and no `latest.log` (Requirements 1, 5, 7, 8). Do not edit the two project-directory cases; Preserved behavior 1 names their pin. The launcher stays below the 200-line limit without an extraction. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Add isolated launcher tests for readiness, collisions, and pre-readiness exit.** Create `scripts/janus-launcher-per-run.test.mjs`. Give it a scratch fixture root, copy `bin/janus.mjs`, `bin/server-log.mjs`, and `bin/read-log-since.mjs` into its `bin/` directory, and write a fake `dist/main.js` selected by the copied launcher (Assumption 14). Use a CommonJS clock preload through `NODE_OPTIONS` to fix `Date.now()` in the launcher process. Each case creates a separate project directory with `.janissary/config.json` containing `{"logEnabled": false}`, a sentinel `.janissary/logs/server.log`, and a prior `localhost-<fixed-stamp>.log` containing a stale `__JANUS_URL__` line plus sentinel bytes. Pass the fixture mode through `JANUS_LAUNCHER_FIXTURE_MODE` as `ready` or `exit`, and the pid-file path through `JANUS_LAUNCHER_FIXTURE_PID_FILE`. The fake server records its pid, then either writes a new `__JANUS_URL__` line and stays alive in `ready` mode, or writes a failure line and exits 7 in `exit` mode. Add "uses its own readiness marker after a filename collision and prints it under --no-open": expect exit 0, stdout equal to the new URL plus a newline, a new file at the next millisecond's name holding that marker, both seeded files byte-for-byte unchanged, and no `latest.log` (Requirements 1, 4, 5, 6, 9, 10, 12, 13). Add "relays only its own pre-readiness failure and preserves the child exit code": expect exit 7, stderr containing the fake failure but not the stale URL, a new file at the next millisecond's name holding the failure, and the seeded files byte-for-byte unchanged (Requirements 5, 7, 8, 9, 10, 11, 13). Kill the detached fixture child by its recorded negative pid in teardown before removing the scratch root, ignoring an already-exited child. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No visual interface surface changes: this edits launcher filesystem and process behavior, with no component, CSS, key binding, or tab involved.
2. The terminal contract is explicit: a child that exits before readiness has its own log tail relayed to stderr and its exit code preserved, while `--no-open` prints the new URL alone on stdout (Requirements 8, 11, 12).

## Tests

- `scripts/server-log.test.mjs`: "names a log localhost followed by the ISO timestamp" (Requirements 2, 3, 4).
- `scripts/janus-launcher.test.mjs`: "writes a failed launch's log under .janissary/logs/server and relays its tail" replaces the old fixed-path case (Requirements 1, 5, 7, 8). The existing missing-path and regular-file cases pin Preserved behavior 1.
- `scripts/janus-launcher-per-run.test.mjs`: "uses its own readiness marker after a filename collision and prints it under --no-open" (Requirements 1, 4, 5, 6, 9, 10, 12, 13) and "relays only its own pre-readiness failure and preserves the child exit code" (Requirements 5, 7, 8, 9, 10, 11, 13).
- The isolated fixture avoids a built web bundle and a real server. The real instance-lock refusal is checked end to end in Verification; the usage-error branch covers the same launcher exit path automatically.
- No edit to `scripts/read-log-since.test.mjs`: its append-offset, truncation, and missing-file cases still exercise the helper called by the launcher.

## Out of scope

- No `latest.log` symlink and no warning line when one cannot be written; subplan 3 owns both.
- No server-log reaping or retention changes; subplan 1 owns the sweep.
- No playbook, driver-comment, or spec edits; subplans 4 and 5 own those.
- No remote logs. `janus remote-serve` stays attached and writes no server log.
- No change to `logEnabled` handling; the launcher never reads it, which is why server logs are written either way.
- No change to the 20-second timeout branch, including its process-group kill, timeout message, and exit 1.
- No migration or cleanup of the old single `server.log`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. From a checkout with `web/dist/index.html` built, create a scratch git project directory. Write `{"logEnabled": false}` to `<scratch>/.janissary/config.json` and sentinel bytes to `<scratch>/.janissary/logs/server.log`. Run `node bin/janus.mjs --no-open <scratch>`. It exits 0 and prints the URL. `.janissary/logs/server/` holds one `localhost-<stamp>.log` whose `__JANUS_URL__` line matches that URL, no `latest.log` exists, and the legacy file still holds its sentinel bytes. With that instance still running, run the same command again: it exits nonzero with `another janus instance is already running in this directory…` relayed from a second, distinctly named log. The second log contains no `__JANUS_URL__` line, the first log and its marker are byte-for-byte unchanged, and the legacy file is still unchanged. Stop the instance with `node bin/janus.mjs stop <scratch>`. Failure looks like no log under `logEnabled: false`, a reused timestamp that truncates the first run, a rewritten legacy file, a `latest.log` from this subplan, or readiness taken from the first instance's marker.
