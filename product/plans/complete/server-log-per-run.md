# Write a new localhost-and-timestamp-named server log for each run under .janissary/logs/server/ and reap old ones by logRetentionInDays

**Complexity: 6/10** — 25 requirements, 11 test scenarios, ~80 added lines across 4 production files (p=6.49)

## Goal

The feature text: "update server.log to be created for each run. logs should be named after the host name and a timestamp in the name, stored in ./janissary/logs/server/ and reaped like transcripts. host name should be `localhost` for the main machine and use the configured host name or the network name as a fallback."

The launcher used to truncate a single `.janissary/logs/server.log` at every launch, losing every earlier run's output, and a second launch refused by the instance lock truncated the running instance's log too. The branch now gives each local run its own server log under `.janissary/logs/server/`, named `localhost-<timestamp>.log`, keeps a `latest.log` link to the running instance's log, and ages old logs out with the launch sweep that already reaps transcripts. This version covers local logs only (user answer: "this feature will focus only on local logs").

## Requirements

1. Each local run writes its server output to a new file under `.janissary/logs/server/` ("update server.log to be created for each run", "stored in ./janissary/logs/server/").
2. The file's name carries the host name and a timestamp ("logs should be named after the host name and a timestamp in the name").
3. The host name in a local server log's name is always `localhost` ("host name should be `localhost` for the main machine"; user answer: "focus only on local logs").
4. A server log's name is the host name followed by the UTC ISO launch time with `:` and `.` replaced by `-`, ending `.log`, e.g. `localhost-2026-11-23T15-04-05-123Z.log` (user answer: "Artifact shape").
5. The launch sweep deletes a server log last modified more than `logRetentionInDays` days before launch ("reaped like transcripts").
6. An existing `.janissary/logs/server.log` is never written, moved, or reaped (user answer: "Leave it").
7. Server logs are written whether `logEnabled` is true or false (user answer: "Not gated").
8. Server logs are reaped by `logRetentionInDays` whatever `logEnabled` says (user answer: "Not gated").
9. A launch that fails, including one refused by the instance lock or a usage error, keeps its own log in `.janissary/logs/server/` (user answer: "Keep it").
10. A failed launch's log tail is still relayed to the terminal (user answer: "Keep it").
11. A failed launch never writes to or truncates the log of the instance already running (user answer: "Keep it").
12. `.janissary/logs/server/latest.log` is a symbolic link to the current run's server log (user answer: "latest.log symlink").
13. The e2e driver's `--log` keeps taking a file, and the playbooks pass `<project-dir>/.janissary/logs/server/latest.log` (user answer: "latest.log symlink").
14. The launch sweep never deletes `latest.log` (user answer: "latest.log symlink").
15. `latest.log` is repointed only after the new server's `__JANUS_URL__` line appears (user answer: "Once ready").
16. A launch that fails or is refused before readiness leaves `latest.log` pointing where it pointed before (user answer: "Once ready").
17. The launcher takes readiness only from a `__JANUS_URL__` line in the new run's own log, never from a line in another run's log (user answer: "Launcher contract"; pinned by `scripts/janus-launcher-per-run.test.mjs` "uses its own readiness marker after a filename collision and prints it under --no-open" and "relays only its own pre-readiness failure and preserves the child exit code").
18. A server that exits before readiness still has the tail of its own log relayed to the terminal, and the launcher exits with the server's own exit code (user answer: "Launcher contract"; pinned by `scripts/janus-launcher-per-run.test.mjs` "relays only its own pre-readiness failure and preserves the child exit code").
19. Under `--no-open`, the launcher still prints the new server's URL on its own line to stdout (user answer: "Launcher contract"; pinned by `scripts/janus-launcher-per-run.test.mjs` "uses its own readiness marker after a filename collision and prints it under --no-open" and "warns once and still succeeds when latest.log is a regular file").
20. The launcher replaces `latest.log` only when it is a symbolic link or absent, never when it is a regular file or a directory (user answer: "Warn, keep running").
21. When `latest.log` cannot be updated, the launch still succeeds (user answer: "Warn, keep running").
22. When `latest.log` cannot be updated, the launcher prints exactly one line to stderr: `warning: could not update <project-dir>/.janissary/logs/server/latest.log: <reason>`, with the absolute path and, as `<reason>`, the error's message, or exactly `not a symbolic link` when a regular file or directory holds the name (user answers: "Warn, keep running", "Could not update", "not a symbolic link").
23. When `latest.log` cannot be updated, it is left as it was (user answer: "Warn, keep running").
24. The launch sweep never deletes a server log last modified within the hour before launch, whatever `logRetentionInDays` says, including `0` (user answer: "last hour").
25. The launch sweep considers only regular `.log` files directly inside `.janissary/logs/server/`, so `.janissary/logs/notifications.json`, `.janissary/logs/activity/`, and the old `.janissary/logs/server.log` are never touched (user answer: "Leave it"; Assumption 5).
26. A same-millisecond filename collision never replaces another run's log: the launcher creates each candidate with `openSync(logPath, 'wx')` and advances the timestamp by one millisecond on `EEXIST` (bin/janus.mjs:105-118), pinned by `scripts/janus-launcher-per-run.test.mjs` "uses its own readiness marker after a filename collision and prints it under --no-open".

## Design decisions

- Local logs only. The host part of the name is always `localhost`; the name keeps the host part so a later version can add remote logs without renaming local ones (user answer: "this feature will focus only on local logs").
- Name server logs with the same label-plus-ISO-timestamp shape `harnessArtifactFilename` gives per-tab artifacts (user answer: "Artifact shape").
- No migration: the old single `server.log` is left in place (user answer: "Leave it").
- `logEnabled` does not gate server logs, because the launcher depends on the local log for readiness and failure reporting (user answer: "Not gated").
- Failed launches keep their logs, and each launch exclusively creates only its own file, so a refused second launch can no longer truncate the running instance's log (user answer: "Keep it"; Assumption 2).
- The running instance's log is found through a `latest.log` symbolic link, repointed by the launcher once the new server is ready (user answers: "latest.log symlink", "Once ready").
- The link holds the bare file name of its target, not an absolute path, so it still resolves after the project directory is moved or mounted elsewhere. It is replaced atomically: `pointLatestLog` makes a temporary symlink at `${latestPath}.${randomUUID()}.tmp` holding the bare name and renames it over `latest.log`, so a reader never finds the name missing between two runs. On any failure it removes the temporary link best-effort and leaves `latest.log` unchanged; `lstatSync` treats only `ENOENT` as absent and returns `not a symbolic link` for an existing regular file or directory (bin/server-log.mjs:14-29).
- Each run's log is created exclusively. `bin/janus.mjs` starts from `serverLogFilename(Date.now())`, calls `openSync(logPath, 'wx')`, and on `EEXIST` advances the timestamp by one millisecond and retries, so a same-millisecond launch cannot truncate another run's file; any other open error propagates (bin/janus.mjs:105-118).
- Readiness and the failure tail come from offset `0` of that fresh file: `await awaitReady(logPath, 0, child)` and `readLogSince(logPath, 0)` (bin/janus.mjs:123 and :133). The file is empty before the child starts, so no earlier run's bytes can be scanned (Assumption 7).
- Only the launcher names server logs. The server's sweep matches by directory and `.log` extension alone, so the name shape lives in one `.mjs` module beside `bin/read-log-since.mjs`, which cannot import the TypeScript `harnessArtifactFilename`. A comment there names `harnessArtifactFilename` as the shape it mirrors, the way `bin/janus.mjs:44` does for `URL_MARKER` (Existing functionality 5).
- The server-log sweep's cutoff is the earlier of "launch minus `logRetentionInDays` days" and "launch minus one hour". The launcher creates the run's log before the server boots, so the server's later launch time would otherwise put the new file before the cutoff when `logRetentionInDays` is `0`, deleting the log the launcher is still polling and timing the launch out (user answer: "last hour"; Assumption 2). Ceiling: a launch that takes more than an hour to reach the sweep could still lose its log, which no real boot comes near.
- The sweep runs from the server's existing launch sweep list, beside the transcript reapers, so it runs once per launch in the background and never delays startup (Existing functionality 3 and 4).

## Preserved behavior

1. A launch whose project directory does not exist still runs the server attached and creates nothing. The new log directory must not be created at, or above, a missing path. Test: `scripts/janus-launcher.test.mjs` "reports a path that does not exist as a usage error, exits 2, and does not create it" (user answer: "Launcher contract").
2. The e2e driver still reads the last `__JANUS_URL__` line of the log it is given. Reading through `latest.log` must not hand back a URL from an earlier instance. Test: `scripts/e2e/session.test.mjs` "reads the latest line, so a restarted app is addressed rather than the instance before it" (user answer: "Launcher contract").
3. The other launch sweeps still start once with the same launch time and retention days, unawaited, and a rejected sweep is swallowed without stopping the rest. Tests: `src/launch-sweeps.test.ts` "starts every sweep once with the launch time and retention days", "returns without waiting for a sweep to finish", "swallows a sweep that rejects without stopping the others", and "swallows a rejecting server log sweep without stopping the others".
4. A successful `--no-open` launch still prints the new URL alone on stdout and exits 0; a blocked link adds exactly one stderr warning and no stdout. Tests: `scripts/janus-launcher-per-run.test.mjs` "uses its own readiness marker after a filename collision and prints it under --no-open" and "warns once and still succeeds when latest.log is a regular file".

## Assumptions

1. The launcher now gives each run its own log: `bin/janus.mjs:103` sets `logDir` to `<project-dir>/.janissary/logs/server` (the recursive `mkdirSync` at `:104` creates it), and `:105`-`:118` exclusively create `localhost-<stamp>.log` with `wx`, retrying the timestamp on `EEXIST`.
2. The launcher creates the log before the server runs, so it exists even for a launch the server refuses: `bin/janus.mjs:120` `spawn(command, commandArguments, { detached: true, stdio: ['ignore', logFd, logFd] })`, and the lock is taken inside the server at `src/main.ts:71` `acquireLock(cwd);`.
3. `janus remote-serve` runs attached and writes no server log, and this plan leaves it so: `bin/janus.mjs:34` `const foregroundCommands = new Set(['stop', 'init', 'remote-serve']);`.
4. The e2e driver reads the app URL from a log path its caller names: `scripts/e2e/session.mjs:44` `export function readAppUrl(serverLogPath) {`.
5. The reaper never deletes a symbolic link, because it considers only regular files: `src/state/reaper.ts:16` `if (!entry.isFile() || !entry.name.endsWith(extension)) continue;`, pinned by `src/state/reaper.test.ts` "keeps symbolic links and their targets".
6. A launch refused by the instance lock throws before the server is ready, so the launcher's exit path relays it: `src/instance-lock.ts:82` `throw alreadyRunning(file, pid);`, whose message begins `another janus instance is already running in this directory`.
7. The launcher reads from offset `0` of the fresh per-run file: `bin/janus.mjs:123` `await awaitReady(logPath, 0, child)` and `:133` `readLogSince(logPath, 0)`. A freshly created per-run file is empty, so no earlier run's bytes are scanned.
8. The state-directory test mocks every registered init module and asserts each is called: `src/state/dirs.test.ts:79` `it('inits every registered subsystem in registry order'`, and pins the key list at `src/state/dirs.test.ts:104` `it('covers exactly the keys the registry is pinned against'`.
9. The browser sandbox denies the whole project state directory, so a log under `.janissary/logs/server/` stays denied with no profile change: `src/sandbox/browser/profile.ts:60` "`<root>/.janissary`, denied rather than allowed".

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The init-records-a-directory, reap-wraps-the-reaper module shape to mirror: `src/shell/transcript/transcript-file.ts:11` `initShellTranscriptDirectory` and `reapShellTranscripts`. Its day arithmetic (`src/state/retention.ts:5` `reapFilesOlderThanDays`) is not reused, because the server-log cutoff adds the one-hour floor.
3. The launch sweep list the transcript, capture, and recording reapers are registered in: `src/launch-sweeps.ts:8` `const SWEEPS = [...]`.
4. The launch sweep start, after config loads: `src/main.ts:80` `startLaunchSweeps(Date.now(), config.logRetentionInDays);`.
5. The label-plus-ISO-timestamp filename shape shared by per-tab artifacts: `src/harness/artifact-name.ts:8` `harnessArtifactFilename`.
6. The precedent for a launcher-side `.mjs` helper with its test under `scripts/`: `bin/read-log-since.mjs` `export function readLogSince(logPath, offset)`, tested by `scripts/read-log-since.test.mjs`.
7. The "never clears" registry test to copy: `src/state/dirs.test.ts:142` `it('never clears the shell transcript directory'`.
8. The `vi.mock` of the reaper for wrapper tests: `src/shell/transcript/transcript-file.test.ts` `vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));`.
9. The atomic temporary-file-plus-rename pattern, including unique naming and best-effort cleanup: `src/atomic-write.ts:8` `atomicWriteFile`.
10. The exclusive-create-with-`EEXIST`-retry precedent for a launcher-side file: `src/pid-lock-file.ts:12` `writeFileSync(file, String(process.pid), { flag: 'wx' })` and its `:16` `EEXIST` branch.

## Implementation steps

The steps land in order, each leaving the tree green. The ready plan `product/plans/ready/activity-logs.md` also edits `src/state/dirs.ts`, `src/state/dirs.test.ts`, `src/main.ts`'s launch sweep, and the `logRetentionInDays` row and `product/specs/state-directory.md:5`. Neither plan depends on the other. Whichever lands second keeps both plans' additions on those shared lines.

1. **Server-log sweep.** `src/server-log/directory.ts` records `path.join(projectDirectory, '.janissary', 'logs', 'server')` in module state through `initServerLogDirectory` and creates nothing; the asynchronous `reapServerLogs(launchedAt, days)` returns without reaping before initialization and otherwise calls `reapFilesOlderThan(directory, '.log', Math.min(launchedAt - days * DAY_MS, launchedAt - HOUR_MS))` with both constants private. `src/state/dirs.ts` adds a `serverLog` entry after `shellTranscript` with no `clear` and a comment naming `reapServerLogs` as the remover, and adds `'serverLog'` to `KNOWN_STATE_DIRECTORY_KEYS` in the same position (15 entries). `src/launch-sweeps.ts` appends `reapServerLogs` to `SWEEPS`, where the runner starts each sweep with `(launchedAt, days)` unawaited and swallows rejections. Tests: `src/server-log/directory.test.ts`, updated `src/state/dirs.test.ts`, and `src/launch-sweeps.test.ts`.
2. **Launcher writes a per-run log, reads its own readiness, and points `latest.log` at it.** `bin/server-log.mjs` exports `serverLogFilename(timestamp)` — `localhost-` plus the UTC ISO time with `:` and `.` replaced by `-`, ending `.log`, with a comment naming `harnessArtifactFilename` — and `pointLatestLog(logDir, fileName)`, which returns `undefined` on success and the reason as a string on failure. `bin/janus.mjs` sets `logDir` to `<project-dir>/.janissary/logs/server`, creates each run's file with `openSync(logPath, 'wx')` advancing the timestamp by one millisecond on `EEXIST`, passes `0` to `awaitReady` and to the exit path's `readLogSince`, drops `logStart` and the unused `fstatSync` import, and after readiness and `child.unref()` calls `pointLatestLog(logDir, path.basename(logPath))` before the `--no-open` URL print and `process.exit(0)`. A returned reason writes exactly one `warning: could not update <logDir>/latest.log: <reason>` line to stderr and the launch continues; the child-exit and timeout paths never call the helper. Tests: `scripts/server-log.test.mjs`, new `scripts/janus-launcher-per-run.test.mjs`, and updated `scripts/janus-launcher.test.mjs`.
3. **Playbooks and the driver.** Every `<project-dir>/.janissary/log/server.log` spelling in `ai/tasks/research/find-bugs.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/workspace/start-application.md`, `ai/tasks/workspace/stop-application.md`, `ai/tasks/workspace/open-feature-pull-request.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/feature/test-pull-request.md`, and `ai/guidelines/sandbox-e2e-browser.md`, and the usage comment at `scripts/e2e-driver.mjs:4`, now reads `<project-dir>/.janissary/logs/server/latest.log`. `start-application.md` and `stop-application.md` name `logs/server/` with its per-run `localhost-<stamp>.log` files and `latest.log` in their `.janissary/` inventories, and `stop-application.md` still tells the reader to read what it needs before the scratch root is removed. The driver's `--log` parsing and `readAppUrl` are unchanged.
4. **Specs.** `product/specs/cli.md` now states the per-run name and collision rule, own-log readiness scan, `latest.log` link and exact warning, failed-launch log retention, tail relay, child exit code, `--no-open` URL output, and the background sweep with its one-hour floor and direct-regular-`.log` scope. `product/specs/application-config.md` adds server logs under `.janissary/logs/server/` to `logRetentionInDays` with the `.log` extension and one-hour floor, and states that `logEnabled` governs neither server-log writing nor reaping. `product/specs/state-directory.md` adds server logs to the kept-and-swept artifacts with the `latest.log` symlink exemption.

## Tests

- `src/server-log/directory.test.ts`: "reaps .log files older than the retention window" with `.janissary/logs/server`, `'.log'`, and `launchedAt - 7 * 86_400_000` (Requirements 5, 8, 25); "never reaps a log modified within the last hour when retention is zero" with `launchedAt - 3_600_000` (Requirement 24); and "reaps nothing before a directory has been chosen" through a fresh module (Requirement 5).
- `src/state/dirs.test.ts`: "inits every registered subsystem in registry order" asserts `initServerLogDirectory`; "covers exactly the keys the registry is pinned against" raises the length to 15; "never clears the server log directory" asserts the `serverLog` entry has no `clear` (Requirement 1).
- `src/launch-sweeps.test.ts`: the existing cases now include `reapServerLogs` through `allSweeps`, plus "swallows a rejecting server log sweep without stopping the others".
- `scripts/server-log.test.mjs`: "names a log localhost followed by the ISO timestamp" (Requirements 2, 3, 4); `pointLatestLog` cases for an absent link created with a bare target and read-through, replacing an existing link, replacing a dangling link, refusing a regular file and a directory without changing them, and returning the error message with no temporary link left for `lstatSync`, symlink, and rename failures (Requirements 12, 20, 21, 22, 23).
- `scripts/janus-launcher.test.mjs`: "writes a failed launch's log under .janissary/logs/server and relays its tail" (exit 2, `Unknown option '--bogus'`, exactly one `localhost-*.log`, the legacy `server.log` unchanged, no `latest.log`) and "leaves an existing server.log, an earlier run's log, and latest.log alone on a failed launch" (all three byte-for-byte unchanged, the link still targeting the earlier file, and a separate new failed-run log) (Requirements 6, 9, 10, 11, 16, 18).
- `scripts/janus-launcher-per-run.test.mjs`, new, with a copied launcher, `bin/server-log.mjs`, `bin/read-log-since.mjs`, a fake `dist/main.js`, and a fixed `Date.now()` clock: "uses its own readiness marker after a filename collision and prints it under --no-open" (Requirements 1, 4, 5, 6, 12, 13, 17, 19, 26), "relays only its own pre-readiness failure and preserves the child exit code" (Requirements 5, 7, 8, 9, 10, 11, 18), "keeps latest.log on the earlier run until the new server prints its readiness marker" (Requirements 12, 15, 16), and "warns once and still succeeds when latest.log is a regular file" (Requirements 20, 21, 22, 23).
- Requirements 7 and 8 hold because nothing in the launcher or the sweep reads `logEnabled`. Requirement 14 is pinned by the existing `src/state/reaper.test.ts` "keeps symbolic links and their targets"; Requirement 13 is a playbook edit covered by the driver comment and task-file paths.

## Out of scope

- No periodic sweep while the app runs. Reaping happens once per launch (user answer: "No extras").
- No splitting, rolling, or size cap within one run's log (user answer: "No extras").
- No new config key. `logRetentionInDays` is shared (user answer: "No extras").
- No command or tab that lists or opens server logs (user answer: "No extras").
- `janus stop` is unchanged (user answer: "No extras").
- Remote server logs. `janus remote-serve` still writes no server log, and the feature text's "use the configured host name or the network name as a fallback" is deferred to a later version (user answer: "this feature will focus only on local logs").
- No migration or deletion of an existing regular file or directory named `latest.log`; the launcher warns and leaves it in place.
- No change to the e2e driver or session reader code; only the driver's example comment moved to `latest.log`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Per-run log and link.** In a scratch git project holding an old `.janissary/logs/server.log`, run `node bin/janus.mjs --no-open <scratch>`. It prints the URL. `.janissary/logs/server/` holds one `localhost-<stamp>.log` whose `__JANUS_URL__` line matches the printed URL, `ls -l .janissary/logs/server/latest.log` shows a link to that bare file name, and the old `server.log` is unchanged. Failure looks like a link to an absolute path, a missing link, or a rewritten `server.log`.
3. **Refused second launch.** With that instance still running, run the same command again. It fails with `another janus instance is already running in this directory…` relayed from a second `localhost-<stamp>.log`. `latest.log` still points at the first file, and the first file still holds its `__JANUS_URL__` line. Failure looks like `latest.log` moving or the first log being truncated.
4. **Next launch and retention zero.** Run `janus stop <scratch>`, set `"logRetentionInDays": 0` in `<scratch>/.janissary/config.json`, set both logs' mtimes two hours back (`touch -t`), and launch again. The launch succeeds, both older logs are gone, the new log remains, and `latest.log` points at it. Failure looks like a timeout, which means the sweep deleted the current log.
5. **Link cannot be updated.** Stop the app, replace `latest.log` with a regular file, and launch. The launch succeeds, stderr shows exactly `warning: could not update <scratch>/.janissary/logs/server/latest.log: not a symbolic link`, and the regular file is unchanged.
6. **Sweep scope with logging off.** In a scratch project with `{"logEnabled": false, "logRetentionInDays": 0}`, create `logs/server/old.log` backdated two hours, a fresh `logs/server/current.log`, `logs/server/notes.txt`, `logs/server/nested/old.log`, and an old `latest.log` symlink to `current.log`; in the parent `logs` directory create `notifications.json` and the old `server.log`. Launch and let the background sweep run. `old.log` is gone; `current.log`, the symlink, the nested and non-`.log` files, and the files outside `logs/server/` are unchanged, and startup does not wait for the sweep. Failure looks like a swept symlink, a missing fresh log, a nested or non-`.log` file changing, an outside file changing, or startup waiting for the sweep.
