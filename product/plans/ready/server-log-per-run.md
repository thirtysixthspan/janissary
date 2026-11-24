# Write a new localhost-and-timestamp-named server log for each run under .janissary/logs/server/ and reap old ones by logRetentionInDays

**Complexity: 6/10** — 25 requirements, 11 test scenarios, ~80 added lines across 4 production files (p=6.49)

## Goal

The feature text: "update server.log to be created for each run. logs should be named after the host name and a timestamp in the name, stored in ./janissary/logs/server/ and reaped like transcripts. host name should be `localhost` for the main machine and use the configured host name or the network name as a fallback."

Today the launcher truncates a single `.janissary/logs/server.log` at the start of every launch, so the output of any earlier run is lost the moment the app starts again. A second launch refused by the instance lock truncates the running instance's log too. This plan gives each local run its own server log under `.janissary/logs/server/`, named `localhost-<timestamp>.log`, keeps a `latest.log` link to the running instance's log, and ages old logs out with the launch sweep that already reaps transcripts. This version covers local logs only (user answer: "this feature will focus only on local logs").

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
17. The launcher takes readiness only from a `__JANUS_URL__` line in the new run's own log, never from a line in another run's log (user answer: "Launcher contract"; no existing test pins it, and an automated test needs a server that reaches readiness, so Verification step 3 checks it).
18. A server that exits before readiness still has the tail of its own log relayed to the terminal, and the launcher exits with the server's own exit code (user answer: "Launcher contract"; no existing test pins the relay, so a new test is required).
19. Under `--no-open`, the launcher still prints the new server's URL on its own line to stdout (user answer: "Launcher contract"; no existing test pins it, and an automated test needs a server that reaches readiness, so Verification step 2 checks it).
20. The launcher replaces `latest.log` only when it is a symbolic link or absent, never when it is a regular file or a directory (user answer: "Warn, keep running").
21. When `latest.log` cannot be updated, the launch still succeeds (user answer: "Warn, keep running").
22. When `latest.log` cannot be updated, the launcher prints exactly one line to stderr: `warning: could not update <project-dir>/.janissary/logs/server/latest.log: <reason>`, with the absolute path and, as `<reason>`, the error's message, or exactly `not a symbolic link` when a regular file or directory holds the name (user answers: "Warn, keep running", "Could not update", "not a symbolic link").
23. When `latest.log` cannot be updated, it is left as it was (user answer: "Warn, keep running").
24. The launch sweep never deletes a server log last modified within the hour before launch, whatever `logRetentionInDays` says, including `0` (user answer: "last hour").
25. The launch sweep considers only regular `.log` files directly inside `.janissary/logs/server/`, so `.janissary/logs/notifications.json`, `.janissary/logs/activity/`, and the old `.janissary/logs/server.log` are never touched (user answer: "Leave it"; Assumption 5).

## Design decisions

- Local logs only. The host part of the name is always `localhost`; the name keeps the host part so a later version can add remote logs without renaming local ones (user answer: "this feature will focus only on local logs").
- Name server logs with the same label-plus-ISO-timestamp shape `harnessArtifactFilename` gives per-tab artifacts (user answer: "Artifact shape").
- No migration: the old single `server.log` is left in place (user answer: "Leave it").
- `logEnabled` does not gate server logs, because the launcher depends on the local log for readiness and failure reporting (user answer: "Not gated").
- Failed launches keep their logs, and each launch writes only its own file, so a refused second launch can no longer truncate the running instance's log (user answer: "Keep it"; Assumption 2).
- The running instance's log is found through a `latest.log` symbolic link, repointed by the launcher once the new server is ready (user answers: "latest.log symlink", "Once ready").
- The link holds the bare file name of its target, not an absolute path, so it still resolves after the project directory is moved or mounted elsewhere. It is replaced atomically: a link made under a temporary name that does not end `.log` is renamed over `latest.log`, so a reader never finds the name missing between two runs.
- Only the launcher names server logs. The server's sweep matches by directory and `.log` extension alone, so the name shape lives in one `.mjs` module beside `bin/read-log-since.mjs`, which cannot import the TypeScript `harnessArtifactFilename`. A comment there names `harnessArtifactFilename` as the shape it mirrors, the way `bin/janus.mjs:43` does for `URL_MARKER` (Existing functionality 5).
- The server-log sweep's cutoff is the earlier of "launch minus `logRetentionInDays` days" and "launch minus one hour". The launcher creates the run's log before the server boots, so the server's later launch time would otherwise put the new file before the cutoff when `logRetentionInDays` is `0`, deleting the log the launcher is still polling and timing the launch out (user answer: "last hour"; Assumption 2). Ceiling: a launch that takes more than an hour to reach the sweep could still lose its log, which no real boot comes near.
- The sweep runs from the server's existing launch sweep list, beside the transcript reapers, so it runs once per launch in the background and never delays startup (Existing functionality 3 and 4).

## Preserved behavior

1. A launch whose project directory does not exist still runs the server attached and creates nothing. The new log directory must not be created at, or above, a missing path. Test: `scripts/janus-launcher.test.mjs` "reports a path that does not exist as a usage error, exits 2, and does not create it" (user answer: "Launcher contract").
2. The e2e driver still reads the last `__JANUS_URL__` line of the log it is given. Reading through `latest.log` must not hand back a URL from an earlier instance. Test: `scripts/e2e/session.test.mjs` "reads the latest line, so a restarted app is addressed rather than the instance before it" (user answer: "Launcher contract").

## Assumptions

1. The launcher opens one fixed log path and truncates it: `bin/janus.mjs:104` `const logPath = path.join(logDir, 'server.log');` and `bin/janus.mjs:105` `const logFd = openSync(logPath, 'w');`.
2. The launcher creates the log before the server runs, so it exists even for a launch the server refuses: `bin/janus.mjs:107` `spawn(command, commandArguments, { detached: true, stdio: ['ignore', logFd, logFd] })`, and the lock is taken inside the server at `src/main.ts:71` `acquireLock(cwd);`.
3. `janus remote-serve` runs attached and writes no server log, and this plan leaves it so: `bin/janus.mjs:33` `const foregroundCommands = new Set(['stop', 'init', 'remote-serve']);`.
4. The e2e driver reads the app URL from a log path its caller names: `scripts/e2e/session.mjs:44` `export function readAppUrl(serverLogPath) {`.
5. The reaper never deletes a symbolic link, because it considers only regular files: `src/state/reaper.ts:16` `if (!entry.isFile() || !entry.name.endsWith(extension)) continue;`, pinned by `src/state/reaper.test.ts` "keeps symbolic links and their targets".
6. A launch refused by the instance lock throws before the server is ready, so the launcher's exit path relays it: `src/instance-lock.ts:82` `throw alreadyRunning(file, pid);`, whose message begins `another janus instance is already running in this directory`.
7. The launcher's log offset exists only to skip an earlier run's bytes in the shared file: `bin/janus.mjs:106` `const logStart = fstatSync(logFd).size;`. A freshly created per-run file is empty, so the offset is always `0`.
8. The state-directory test mocks every registered init module and asserts each is called: `src/state/dirs.test.ts:75` `it('inits every registered subsystem in registry order'`, and pins the key list at `src/state/dirs.test.ts:99` `it('covers exactly the keys the registry is pinned against'`.
9. The browser sandbox denies the whole project state directory, so a log under `.janissary/logs/server/` stays denied with no profile change: `src/sandbox/browser/profile.ts:60` "`<root>/.janissary`, denied rather than allowed".

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The init-records-a-directory, reap-wraps-the-reaper module shape to mirror: `src/shell/transcript/transcript-file.ts:11` `initShellTranscriptDirectory` and `reapShellTranscripts`. Its day arithmetic (`src/state/retention.ts:5` `reapFilesOlderThanDays`) is not reused, because the server-log cutoff adds the one-hour floor.
3. The launch sweep list the transcript, capture, and recording reapers are registered in: `src/launch-sweeps.ts:6` `const SWEEPS = [reapHarnessCaptures, reapHarnessRecordings, reapHarnessTranscripts, reapShellTranscripts];`.
4. The launch sweep start, after config loads: `src/main.ts:80` `startLaunchSweeps(Date.now(), config.logRetentionInDays);`.
5. The label-plus-ISO-timestamp filename shape shared by per-tab artifacts: `src/harness/artifact-name.ts:8` `harnessArtifactFilename`.
6. The precedent for a launcher-side `.mjs` helper with its test under `scripts/`: `bin/read-log-since.mjs` `export function readLogSince(logPath, offset)`, tested by `scripts/read-log-since.test.mjs`.
7. The "never clears" registry test to copy: `src/state/dirs.test.ts:137` `it('never clears the shell transcript directory'`.
8. The `vi.mock` of the reaper for wrapper tests: `src/shell/transcript/transcript-file.test.ts` `vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));`.

## Implementation steps

The steps land in order, each leaving the tree green. The ready plan `product/plans/ready/activity-logs.md` also edits `src/state/dirs.ts`, `src/state/dirs.test.ts`, `src/main.ts`'s launch sweep, and the `logRetentionInDays` row and `product/specs/state-directory.md:5`. Neither plan depends on the other. Whichever lands second keeps both plans' additions on those shared lines.

1. **Server-log sweep.** Add `src/server-log/directory.ts`, shaped like `src/shell/transcript/transcript-file.ts` (Existing functionality 2). `initServerLogDirectory(projectDirectory)` records `path.join(projectDirectory, '.janissary', 'logs', 'server')` in module state and creates nothing. `reapServerLogs(launchedAt, days)` returns without reaping when no directory is set. Otherwise it calls `reapFilesOlderThan(directory, '.log', cutoff)` from `../state/reaper.js`, where `cutoff` is `Math.min(launchedAt - days * DAY_MS, launchedAt - HOUR_MS)` with both constants module-private. In `src/state/dirs.ts`, import `initServerLogDirectory` from `../server-log/directory.js`, add a `serverLog` entry after `shellTranscript` with no `clear` and the "No `clear`, deliberately" comment naming `reapServerLogs` as the remover, and add `'serverLog'` to `KNOWN_STATE_DIRECTORY_KEYS` in the same position. In `src/launch-sweeps.ts`, import `reapServerLogs` from `./server-log/directory.js` and append it to `SWEEPS`. In `src/state/dirs.test.ts`, add the hoisted `initServerLogDirectory` mock and its `vi.mock('../server-log/directory.js', …)`, and assert it in "inits every registered subsystem in registry order" (Assumption 8). Add `src/server-log/directory.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Launcher writes a per-run log and points `latest.log` at it.** Add `bin/server-log.mjs` beside `bin/read-log-since.mjs`, with two exports. `serverLogFilename(timestamp)` returns `localhost-` plus the UTC ISO string with `:` and `.` replaced by `-`, plus `.log`, with a comment naming `harnessArtifactFilename` as the shape it mirrors. `pointLatestLog(logDir, fileName)` returns `undefined` on success or the reason as a string. It reads `latest.log` with `lstatSync`: when the entry exists and is not a symbolic link, it returns `not a symbolic link` and changes nothing. Otherwise it makes a symbolic link holding the bare `fileName` at `.latest.log-<pid>.tmp` in `logDir`, then renames it over `latest.log`. If either call throws, it removes the temporary link (ignoring a failure to remove it) and returns the error's `message`. The temporary link and rename exist because Requirement 23 leaves `latest.log` as it was on any failure, which an unlink followed by a new link cannot promise. In `bin/janus.mjs`, set `logDir` to `<project-dir>/.janissary/logs/server` (the existing recursive `mkdirSync` at `bin/janus.mjs:103` creates it), build `logPath` from `serverLogFilename(Date.now())` in place of `'server.log'`, keep the existing `openSync(logPath, 'w')`, and pass `0` wherever `logStart` is passed today, to `awaitReady` and to the exit path's `readLogSince` (Assumption 7), deleting `logStart`, removing the then-unused `fstatSync` import. After `awaitReady` resolves and before the `--no-open` URL is printed, call `pointLatestLog`. When it returns a reason, write `warning: could not update <logDir>/latest.log: <reason>` and a newline to stderr, then continue to the URL print and `process.exit(0)` as today. The exit and timeout paths never call `pointLatestLog`. Update the `scripts/janus-launcher.test.mjs` log-location test and add `scripts/server-log.test.mjs`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Playbooks and the driver.** Replace every `<project-dir>/.janissary/log/server.log` (and the other spellings of that path) with `<project-dir>/.janissary/logs/server/latest.log` in `ai/tasks/research/find-bugs.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/workspace/start-application.md`, `ai/tasks/workspace/stop-application.md`, `ai/tasks/workspace/open-feature-pull-request.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/feature/test-pull-request.md`, and `ai/guidelines/sandbox-e2e-browser.md`, and in the usage comment at `scripts/e2e-driver.mjs:4`. Where `start-application.md` and `stop-application.md` list what lives under `.janissary/`, name `logs/server/` with its per-run logs and `latest.log`. `stop-application.md` must still tell the reader to read the log before the scratch root is removed. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Specs.** In `product/specs/cli.md`, rewrite the server-log passages at `:42`, `:52`, `:66`, `:68`, and `:99`: each launch writes a new `.janissary/logs/server/localhost-<stamp>.log`; the launcher watches that file for the `__JANUS_URL__` line; `latest.log` is repointed once the server is ready, with the warning line when it cannot be; a failed launch keeps its log; logs are kept across launches and swept by age with the one-hour floor; `logEnabled` does not govern them; and the old `.janissary/logs/server.log` is left alone. In `product/specs/application-config.md:16`, add server logs under `.janissary/logs/server/` to the `logRetentionInDays` row, with `.log` files among the regular files considered and the one-hour floor. In `product/specs/state-directory.md:5`, add server logs under `.janissary/logs/server/` to the kept-and-swept sentence. Build command: `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/server-log/directory.test.ts`, mocking `../state/reaper.js` as `src/shell/transcript/transcript-file.test.ts` does (Existing functionality 8):
  - "reaps .log files older than the retention window": one reaper call with `.janissary/logs/server`, `'.log'`, and `launchedAt - 7 * 86_400_000` (Requirements 5, 8, 25).
  - "never reaps a log modified within the last hour when retention is zero": with `days` `0`, the cutoff is `launchedAt - 3_600_000` (Requirement 24).
  - "reaps nothing before a directory has been chosen" (Requirement 5).
- `src/state/dirs.test.ts`: "never clears the server log directory", asserting the `serverLog` entry has no `clear`, copied from "never clears the shell transcript directory" (Existing functionality 7; Requirement 1), and the added `initServerLogDirectory` expectation in "inits every registered subsystem in registry order".
- `scripts/server-log.test.mjs`, new, beside `scripts/read-log-since.test.mjs`, against a scratch directory:
  - "names a log localhost followed by the ISO timestamp": `localhost-2026-11-23T15-04-05-123Z.log` for that UTC instant (Requirements 2, 3, 4).
  - "points latest.log at the new log by file name": the link's target is the bare file name, and reading through it gives the new file's content (Requirement 12).
  - "replaces an existing latest.log link" (Requirement 12).
  - "refuses to replace a regular file or a directory named latest.log": the entry and its content are unchanged and the reason is `not a symbolic link` (Requirements 20, 23).
- `scripts/janus-launcher.test.mjs`:
  - Replace "writes the server log to .janissary/logs, not .janissary/log" with "writes a failed launch's log under .janissary/logs/server and relays its tail": with `--bogus`, exit status is `2`, stderr contains `Unknown option '--bogus'`, exactly one `localhost-*.log` exists under `.janissary/logs/server/` holding the same text, no `.janissary/logs/server.log` or `.janissary/log/server.log` is created, and no `latest.log` exists (Requirements 9, 10, 16, 18).
  - "leaves an existing server.log, an earlier run's log, and latest.log alone on a failed launch": pre-seed `.janissary/logs/server.log`, an earlier `localhost-*.log`, and a `latest.log` link to it, launch with `--bogus`, and assert all three are byte-for-byte unchanged and the link still targets the earlier file (Requirements 6, 11, 16).
- Requirements 7 and 8 hold because nothing in the launcher or the sweep reads `logEnabled`. Requirements 15, 17, 19, 21, and 22 need a server that reaches readiness, which the launcher tests cannot start without a built web bundle. They are confirmed in Verification steps 2, 3, and 5, and their link logic is unit-tested through `pointLatestLog` above. Requirement 13 is a playbook edit. Requirement 14 is pinned by the existing `src/state/reaper.test.ts` "keeps symbolic links and their targets" (Assumption 5).

## Out of scope

- No periodic sweep while the app runs. Reaping happens once per launch (user answer: "No extras").
- No splitting, rolling, or size cap within one run's log (user answer: "No extras").
- No new config key. `logRetentionInDays` is shared (user answer: "No extras").
- No command or tab that lists or opens server logs (user answer: "No extras").
- `janus stop` is unchanged (user answer: "No extras").
- Remote server logs. `janus remote-serve` still writes no server log, and the feature text's "use the configured host name or the network name as a fallback" is deferred to a later version (user answer: "this feature will focus only on local logs").

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Per-run log and link.** In a scratch git project holding an old `.janissary/logs/server.log`, run `node bin/janus.mjs --no-open <scratch>`. It prints the URL. `.janissary/logs/server/` holds one `localhost-<stamp>.log` whose `__JANUS_URL__` line matches the printed URL, `ls -l .janissary/logs/server/latest.log` shows a link to that bare file name, and the old `server.log` is unchanged. Failure looks like a link to an absolute path, a missing link, or a rewritten `server.log`.
3. **Refused second launch.** With that instance still running, run the same command again. It fails with `another janus instance is already running in this directory…` relayed from a second `localhost-<stamp>.log`. `latest.log` still points at the first file, and the first file still holds its `__JANUS_URL__` line. Failure looks like `latest.log` moving or the first log being truncated.
4. **Next launch and retention zero.** Run `janus stop <scratch>`, set `"logRetentionInDays": 0` in `<scratch>/.janissary/config.json`, set both logs' mtimes two hours back (`touch -t`), and launch again. The launch succeeds, both older logs are gone, the new log remains, and `latest.log` points at it. Failure looks like a timeout, which means the sweep deleted the current log.
5. **Link cannot be updated.** Stop the app, replace `latest.log` with a regular file, and launch. The launch succeeds, stderr shows exactly `warning: could not update <scratch>/.janissary/logs/server/latest.log: not a symbolic link`, and the regular file is unchanged.
