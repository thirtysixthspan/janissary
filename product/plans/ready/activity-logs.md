# Rename the daily JSON log to the activity log, move it to .janissary/logs/activity/, and gate and reap it with logEnabled and logRetentionInDays

**Complexity: 6/10** — 24 requirements, 7 production files, 10 test scenarios, ~35 added lines (p=6.43)

## Goal

The feature text: "the <YYYY-MM-DD>.json logs stored in .janissary/log should be called activity logs and moved to .janissary/logs/activity/. then rename the spec title "Append-only Log" → "Activity Log", and TranscriptLogger → ActivityLogger. these logs should be reaped and gated by logEnabled and logRetentionInDays."

Today `TranscriptLogger` appends every tab transcript entry to a daily `<YYYY-MM-DD>.json` file under `.janissary/log/`. Those files are never cleared, and `logEnabled` and `logRetentionInDays` do not govern them. This plan renames them activity logs and writes them under `.janissary/logs/activity/`, beside the other files that outlive a run. `logEnabled` turns them off, and the launch sweep that already reaps transcripts and captures ages them out by `logRetentionInDays`. Files already in `.janissary/log/` are left where they are.

## Requirements

1. Each activity log entry is appended to `.janissary/logs/activity/<YYYY-MM-DD>.json` ("moved to .janissary/logs/activity/").
2. No entry is written under `.janissary/log/` ("moved to .janissary/logs/activity/").
3. Files already in `.janissary/log/` are not moved, deleted, or reaped (user answer: "Leave them").
4. The logger class is named `ActivityLogger` ("TranscriptLogger → ActivityLogger").
5. The logger module lives at `src/activity-log/logger.ts` and its record type at `src/activity-log/types.ts` as `ActivityLogRecord`, and `src/transcript/` is removed (user answer: "All the names").
6. The logger's state-directory registry key is `activityLog` (user answer: "All the names").
7. The spec file is `product/specs/activity-log.md` (user answer: "All the names").
8. The spec is titled `# Activity Log` ("rename the spec title "Append-only Log" → "Activity Log"").
9. With `"logEnabled": false`, no activity log entry is written ("gated by logEnabled").
10. With `"logEnabled": false`, `.janissary/logs/activity/` is not created (user answer: "Create on first write").
11. With `"logEnabled": true`, `.janissary/logs/activity/` is created when the first entry is written, not at launch (user answer: "Create on first write").
12. With `"logEnabled": false`, another `entry:appended` subscriber still receives every entry (user answer: "Bus subscribers").
13. The launch sweep deletes an activity log last modified more than `logRetentionInDays` days before launch ("these logs should be reaped"; user answer: "Last modified").
14. A `logRetentionInDays` of `0` deletes every activity log last modified before launch (the shared key's existing meaning, "with `0` keeping none from earlier runs").
15. The sweep never deletes an activity log last modified at or after launch, including when `logRetentionInDays` is `0` (user answer: "A file touched during this run is never reaped").
16. The sweep runs once per launch, in the background, without delaying startup (user answer: "Same rule as transcripts, captures, and recordings").
17. The sweep runs whether `logEnabled` is true or false (user answer: "Always reap").
18. The sweep considers only regular `.json` files directly inside `.janissary/logs/activity/` (user answer: "Sibling files safe").
19. The sweep never deletes `.janissary/logs/server.log`, `.janissary/logs/notifications.json`, or anything else outside `.janissary/logs/activity/` (user answer: "Sibling files safe").
20. `.janissary/logs/activity/` is never cleared at launch (the existing spec: "The directory is never cleared").
21. The first failed activity log write prints exactly `activity log: write failed, not logging for the rest of this run: <error message>` to stderr, one line (user answer: "Own line").
22. After the first failed write, no further write is attempted and no further line is printed for the rest of the run (user answer: "Give up after one").
23. A failed write raises no notification (user answer: "No notification is raised").
24. A failed write does not throw into the message bus, so the bus prints no `message bus: transcript:entry:appended listener failed` line for it (user answer: "Own line").

## Design decisions

- Move `src/transcript/logger.ts` and `src/transcript/types.ts` to `src/activity-log/logger.ts` and `src/activity-log/types.ts`, rename `TranscriptLogger` to `ActivityLogger` and `LogRecord` to `ActivityLogRecord`, and remove the then-empty `src/transcript/` directory (user answer: "All the names"; Assumption 6).
- The logger reads `getConfig().logEnabled` on each append rather than at construction. The state-directory registry constructs the logger before `loadConfig` runs, so a value captured at construction would always be the default (Assumption 3). Config is loaded once per launch and no runtime command changes `logEnabled`, so a change applies from the next launch (Assumption 7).
- Create the directory lazily. The constructor only records the directory path. Each append that passes the gate calls `mkdirSync` with `recursive: true` on the directory before appending, which is a no-op once it exists (user answer: "Create on first write"). No flag tracks whether the directory was made. Ceiling: one extra syscall per logged entry, which is cheap because entries arrive per command, not per keystroke. If logging ever becomes high-frequency, add a module flag, reset by the constructor, so the create runs once per directory.
- A failed write gives up for the run. The first create or append that throws is caught inside the logger, writes the one stderr line with the error formatted by `errorText`, and sets a module `abandoned` flag that every later append checks first. A constructor given a project directory resets `abandoned` to false, the way `initNotificationRecord` resets its own at `src/notifications/record.ts:22` `abandoned = false;`. This mirrors the notification record's `abandoned` flag (Existing functionality 4) and keeps the throw away from the bus's own reporting (user answers: "Give up after one", "Own line").
- Add `reapActivityLogs(launchedAt, days)` to `src/activity-log/logger.ts`, mirroring `reapShellTranscripts`. It returns without reaping when no directory has been set, and otherwise calls `reapFilesOlderThan(<activity directory>, '.json', launchedAt - days * DAY_MS)` (user answer: "Last modified"; Existing functionality 1 and 2). It lives beside the logger because the logger owns the directory path. Keeping the sweep in the same module is smaller than adding a module just to share one string.
- Start the sweep from `src/main.ts` beside the other three, unawaited with a swallowing rejection handler. The cutoff is fixed at launch time minus `logRetentionInDays` days, so today's file, which this run keeps appending to, is never reaped during the run (Existing functionality 3). Ceiling: a run that stays up for weeks keeps every activity log it writes until the next launch.
- The sweep ignores `logEnabled` (user answer: "Always reap").
- No migration of `.janissary/log/`. Existing files there are left in place and never reaped, unlike the notification record's one-time move (user answer: "Leave them").
- The registry entry stays without a `clear`, now with the "No `clear`, deliberately" comment the capture and transcript entries carry, naming `reapActivityLogs` as the remover (Existing functionality 5).
- Rename the spec file with the spec title, since no other file links to `append-only-log` (Assumption 5).

## Preserved behavior

1. Each entry is still one `{"timestamp","agent","text"}` JSON line appended to the file for the local date. The rename and the move must not change the bytes written or split a day across files. Test: `src/transcript/logger.test.ts` "appends a JSON line to today's log file", which moves to `src/activity-log/logger.test.ts` (user answer: "Entry format & daily file").
2. A command's input and its output are still logged as separate entries for the tab that ran it. Gating must not drop either entry when `logEnabled` is true. Test: `src/controller.test.ts` "records transcript content in the append-only log", renamed "records transcript content in the activity log" (user answer: "Entry format & daily file").
3. Before a project directory is set, an append still writes nothing and does not throw. Lazy directory creation must not resolve a path against the working directory or create anything there. Test: `src/transcript/logger.test.ts` "writes nothing, rather than resolving the path against the working directory", which moves to `src/activity-log/logger.test.ts` (user answer: "Unconfigured no-op").
4. Command capture still collects every entry appended to its tab. The logger's changes must not unsubscribe it or stop the bus delivering to it. Test: `src/capture/execute-and-capture.test.ts` "collects every entry appended to the named tab while the run lasts, in order" (user answer: "Bus subscribers").
5. The shell transcript sweep still reaps `.txt` transcripts by the retention window. Adding the activity log sweep must not change its directory, extension, or cutoff. Test: `src/shell/transcript/transcript-file.test.ts` "reaps .txt files older than the retention window".
6. The reaper still keeps files with another extension. The activity log sweep must not delete a non-`.json` file in its directory. Test: `src/state/reaper.test.ts` "keeps files whose names do not end with the extension" (user answer: "Sibling files safe").

## Assumptions

1. The daily log directory is set in one place: `src/transcript/logger.ts:25` `logDir = path.join(projectDir, '.janissary', 'log');`.
2. Each entry is appended to a file named for the local date: `src/transcript/logger.ts:17` `` path.join(logDir, `${getDateStr()}.json`) ``, and `src/datetime.ts:3` `const y = now.getFullYear();` reads local, not UTC, fields.
3. The logger is constructed by the state-directory registry before the config is loaded: `src/state/dirs.ts:100` `init: (projectDir: string): void => { new TranscriptLogger(projectDir); },` runs from `src/main.ts:75` `initStateDirectories(`, ahead of `src/main.ts:76` `const config = loadConfig(cwd);`. Before `loadConfig`, `getConfig` answers the defaults: `src/config.ts:118` `let config: Config = { ...DEFAULT_CONFIG };`.
4. The logger's only production caller is the registry entry, and its only importers are `src/state/dirs.ts:14`, `src/state/dirs.test.ts:64` and `:72`, and `src/controller.test.ts:10` `import { TranscriptLogger } from './transcript/logger.js';`.
5. The spec is `product/specs/append-only-log.md`, titled `# Append-only Log`, and no spec, help page, or `ai/` file links to `append-only-log`.
6. `src/transcript/` holds only `logger.ts`, `logger.test.ts`, and `types.ts`. `LogRecord` is imported only by `src/transcript/logger.ts:3` `import type { LogRecord } from './types.js';`.
7. No runtime command changes `logEnabled`. `updateConfig` is called only for `syntaxTheme`, `theme`, and `pluginSettings`: `src/commands/theme.ts:27` `updateConfig({ theme: canonical })`, `src/plugins/settings.ts:15` `updateConfig({ pluginSettings:`.
8. A throwing bus listener is caught and reported to stderr by the bus: `src/bus.ts:27` `` process.stderr.write(`message bus: ${channel}:${type} listener failed: ${errorText(error)}\n`); ``.
9. `janus remote-serve` says in a comment that it writes nothing to the old directory: `src/remote/serve.ts:17` "and writes nothing to `.janissary/log/`".
10. The `logEnabled` and `logRetentionInDays` comments in `src/config.ts:50` and `:54` name only harness and shell transcripts and captures: "Whether harness and shell transcript files are written at all", "How many days a harness or shell transcript, or a harness capture file, is kept".
11. The specs that list what `logEnabled` and `logRetentionInDays` govern, and what is kept across launches, are `product/specs/application-config.md:16` and `:17` and `product/specs/state-directory.md:5`.

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The shell transcript reaper wrapper, with the day arithmetic and uninitialized guard, to mirror: `src/shell/transcript/transcript-file.ts:26` `reapShellTranscripts`.
3. The background launch sweep, started unawaited after the config loads: `src/main.ts:84` `void reapShellTranscripts(Date.now(), config.logRetentionInDays).catch(() => {});`.
4. A give-up-after-first-failure flag on an append-only record: `src/notifications/record.ts:19` `let abandoned = false;`, checked at `:93` `if (!recordPath || abandoned) return;`.
5. The state-directory registry entries deliberately left without a `clear`: `src/state/dirs.ts:27` "No `clear`, deliberately".
6. The error formatter the bus uses for its stderr line: `src/error-text.ts:1` `export function errorText(error: unknown): string {`.
7. The test pattern for overriding `logEnabled`: `src/harness/observers.test.ts:114` `vi.spyOn(config, 'getConfig').mockReturnValue({ ...defaults, logEnabled: false });`.

## Implementation steps

The steps land in order, each leaving the tree green. The ready plan `product/plans/ready/recording-retention-reaper.md` also edits the launch sweep in `src/main.ts`, `src/state/dirs.ts`, the `logEnabled` and `logRetentionInDays` rows of `product/specs/application-config.md`, and `product/specs/state-directory.md:5`. Neither plan depends on the other. Whichever lands second keeps both plans' additions on those shared lines.

1. **Rename and move the logger.** Move `src/transcript/logger.ts`, `src/transcript/types.ts`, and `src/transcript/logger.test.ts` to `src/activity-log/`, and remove `src/transcript/`. Rename `TranscriptLogger` to `ActivityLogger` and `LogRecord` to `ActivityLogRecord`. Point the directory at `.janissary/logs/activity` (`path.join(projectDir, '.janissary', 'logs', 'activity')`). In `src/state/dirs.ts`, import from `../activity-log/logger.js`, rename the registry entry and its `KNOWN_STATE_DIRECTORY_KEYS` key from `transcriptLog` to `activityLog`, and add a "No `clear`, deliberately" comment naming `reapActivityLogs` as the remover. In `src/state/dirs.test.ts`, repoint the mock and the import to `../activity-log/logger.js` and the expectation to `ActivityLogger`. In `src/controller.test.ts`, repoint the import and rename the test to "records transcript content in the activity log". In the moved logger test, update the path expectations to `.janissary/logs/activity`. Update the comment at `src/remote/serve.ts:17` to say `.janissary/logs/activity/`, and the comment in `src/notifications/record.ts` that cites `TranscriptLogger` to cite `ActivityLogger`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Gate on `logEnabled`, create the directory lazily, and give up after a failure.** In `src/activity-log/logger.ts`, the constructor records the directory path, resets `abandoned` when given a project directory, and subscribes, but no longer creates the directory. `ActivityLogger.append` returns at once when no directory is set, when the module `abandoned` flag is set, or when `getConfig().logEnabled` is false. Otherwise it creates the directory recursively, then appends the line. Any throw from either is caught: it writes `activity log: write failed, not logging for the rest of this run: <errorText(error)>` and a newline to stderr, sets `abandoned`, and returns without rethrowing. Update the moved test: replace "creates the log directory on init" with the lazy-creation tests below, and add the gating and failure tests. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Reap at launch.** Add `reapActivityLogs(launchedAt, days)` to `src/activity-log/logger.ts` with a module-private `DAY_MS`, mirroring `reapShellTranscripts`. In `src/main.ts`, import it from `./activity-log/logger.js` and start `void reapActivityLogs(Date.now(), config.logRetentionInDays).catch(() => {});` beside the other three sweeps. Update the `logEnabled` and `logRetentionInDays` comments in `src/config.ts` to include activity logs. Add the reaper tests in a new `src/activity-log/reap.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Specs.** Rename `product/specs/append-only-log.md` to `product/specs/activity-log.md` and retitle it `# Activity Log`. Replace `.janissary/log/` with `.janissary/logs/activity/` and "append-only log" with "activity log" throughout. Rewrite § Log rotation. A new file starts each local day, matching `getDateStr`, where the spec says UTC today (Assumption 2). The launch sweep deletes files last modified more than `logRetentionInDays` days before launch, whatever `logEnabled` says. Files left in the old `.janissary/log/` are not moved or reaped. Rewrite § Lifecycle. `ActivityLogger` in `src/activity-log/logger.ts` is constructed at startup, where the spec now cites a stale `initLogDir in src/logger.ts`. The directory is created on the first written entry. The directory is never cleared. With `logEnabled` false nothing is written and no directory is created. The first failed write prints the one stderr line and stops logging for the run. In `product/specs/application-config.md`, add activity logs under `.janissary/logs/activity/` to the `logEnabled` row's list of what is written, and to the `logRetentionInDays` row's list of what is kept, with the row's "only regular `.txt` files" widened to "regular `.txt` files, and `.json` files for activity logs,". In `product/specs/state-directory.md:5`, add activity logs under `.janissary/logs/activity/` to the kept-and-swept sentence, citing [[activity-log]]. Build command: `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/activity-log/logger.test.ts`, moved from `src/transcript/logger.test.ts` with paths updated to `.janissary/logs/activity` (Requirements 1, 4, 5):
  - Replace "creates the log directory on init" with "creates no directory until the first entry is written". Construct the logger and assert `.janissary/logs/activity` does not exist, then append and assert it does (Requirement 11).
  - Add "writes nothing under .janissary/log", asserting `.janissary/log` does not exist after an append (Requirement 2).
  - Add "writes no entry and creates no directory when logEnabled is false", spying `getConfig` as Existing functionality 7 does (Requirements 9, 10).
  - Add "still delivers entries to other subscribers when logEnabled is false". With `logEnabled` false and a second `entry:appended` listener subscribed, emitting an entry calls that listener and `messageBus.emit` returns no failures (Requirement 12).
  - Add "prints one stderr line and stops writing after a failed write". Make the project path a regular file so the directory cannot be created. Spy `process.stderr.write`, append twice, and assert exactly one write of `activity log: write failed, not logging for the rest of this run: ` followed by the error text, and that no `message bus:` line was written (Requirements 21, 22, 24).
  - The "before a directory is configured" block stays first in the file, because `logDir` is module state with no reset.
- `src/activity-log/reap.test.ts`, new, because `vi.mock` is hoisted to the whole file and would stub the reaper under the I/O tests. Mock `../state/reaper.js` as `src/shell/transcript/transcript-file.test.ts` does. Add "reaps .json files older than the retention window", which asserts one reaper call with the activity directory, `.json`, and `launchedAt - 7 * 86_400_000`. Add "uses launch as the cutoff when retention is zero" and "reaps nothing before a directory has been chosen" (Requirements 13, 14, 15, 18, 19).
- `src/state/dirs.test.ts`: repoint to `ActivityLogger`, and add "never clears the activity log directory", asserting the `activityLog` entry has no `clear` (Requirements 6, 20).
- `src/controller.test.ts`: the renamed "records transcript content in the activity log" (Preserved behavior 2).
- Requirement 3 is met by writing no code that touches `.janissary/log/`. Requirements 16 and 17 are the unconditional, unawaited, rejection-handled call in `src/main.ts`, which has no test file. Those three are confirmed in Verification. Requirement 23 holds because the logger has no path to the notification manager. Requirements 7 and 8 are spec files.

## Out of scope

- No migration, move, or cleanup of files already in `.janissary/log/` (user answer: "Leave them").
- No change to the entry format, the daily file name, or what is logged (user answer: "Entry format & daily file").
- No recurring sweep while the app runs. Reaping happens once per launch.
- No new config key. `logEnabled` and `logRetentionInDays` are shared.
- No notification for a failed write (user answer: "Give up after one").
- The stale `.janissary/log/server.log` paths in `ai/tasks/` and `ai/guidelines/sandbox-e2e-browser.md` are left for the server-log backlog item, which moves the server log again (user answer: "Leave for server-log").
- `janus remote-serve` still writes no activity log. Only its comment changes.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **New location, lazy directory.** In a scratch project with an existing `.janissary/log/2026-01-01.json`, launch Janissary. `.janissary/logs/activity/` does not exist yet. Run `help` in the janus tab: `.janissary/logs/activity/<today>.json` appears, holding a `{"timestamp","agent":"janus","text":"help"}` line and a separate output line. `.janissary/log/2026-01-01.json` is untouched and nothing new is written under `.janissary/log/`. Failure looks like the directory existing before the first command, or a new file under `.janissary/log/`.
3. **The sweep ages logs out.** With Janissary stopped, backdate one activity log by ten days with `touch -t`, leave another current, and drop a ten-day-old `notes.txt` beside them. Backdate `.janissary/logs/notifications.json` by ten days too. Relaunch with the default config. Within a few seconds the backdated `.json` is gone. The current one, `notes.txt`, `notifications.json`, and `server.log` remain, and the UI opened without waiting. Set `"logRetentionInDays": 0` and relaunch: every activity log from earlier runs is gone, and the file written after that relaunch is kept. Failure looks like a backdated `.json` surviving, or any file outside `.janissary/logs/activity/` deleted.
4. **`logEnabled` off.** Remove `.janissary/logs/activity/`, set `"logEnabled": false`, and relaunch. Run several commands: `.janissary/logs/activity/` is never created, and each command's output still appears in the janus tab. Put back a ten-day-old activity log while Janissary is stopped and relaunch with `logEnabled` still false: it is deleted. Failure looks like the directory appearing, or the old file surviving.
5. **Write failure.** With `logEnabled` true and Janissary stopped, create `.janissary/logs/activity` as a regular file instead of a directory. Launch and run two commands. `.janissary/logs/server.log` holds exactly one `activity log: write failed, not logging for the rest of this run: ...` line and no `message bus: transcript:entry:appended listener failed` line, and no notification appears. Failure looks like a line per command, a bus line, or a notification.
