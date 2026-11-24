# Rename the daily JSON log to the activity log, move it to .janissary/logs/activity/, and gate and reap it with logEnabled and logRetentionInDays

**Complexity: 6/10** — 26 requirements, 7 production files, 17 test scenarios, ~35 added lines (p=6.43)

## Goal

The feature text: "the <YYYY-MM-DD>.json logs stored in .janissary/log should be called activity logs and moved to .janissary/logs/activity/. then rename the spec title "Append-only Log" → "Activity Log", and TranscriptLogger → ActivityLogger. these logs should be reaped and gated by logEnabled and logRetentionInDays."

The daily JSON transcript log is now the activity log and is written to `.janissary/logs/activity/<YYYY-MM-DD>.json`, beside the other files that outlive a run. `TranscriptLogger` became `ActivityLogger`, its record type became `ActivityLogRecord`, and the module moved from `src/transcript/` to `src/activity-log/`. `logEnabled` gates activity log writes without disturbing other message-bus subscribers, and the background launch sweep that already reaps transcripts and captures ages activity logs out by `logRetentionInDays`. Files already in `.janissary/log/` were left where they are.

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
25. The failed-write test asserts a non-empty error message follows the `activity log: write failed, not logging for the rest of this run: ` prefix and comes before the trailing newline, so dropping the cause fails the suite.
26. That assertion does not pin a platform-specific error string such as `ENOTDIR`, keeping the test portable.

## Design decisions

- `src/transcript/logger.ts`, `src/transcript/types.ts`, and `src/transcript/logger.test.ts` moved to `src/activity-log/`; `TranscriptLogger` was renamed `ActivityLogger` (`src/activity-log/logger.ts:16`) and `LogRecord` became `ActivityLogRecord` (`src/activity-log/types.ts:1`), and the now-empty `src/transcript/` was removed (user answer "All the names"; Assumptions 4, 6). The entry format and daily file name are byte-for-byte unchanged.
- The directory is chosen in one place: `src/activity-log/logger.ts:38` `path.join(projectDir, '.janissary', 'logs', 'activity')`, so every write goes to the new path.
- `ActivityLogger.append` reads `getConfig().logEnabled` on each call (`src/activity-log/logger.ts:22`) rather than at construction. The state-directory registry constructs the logger before `loadConfig` runs (`src/state/dirs.ts:103` from `src/main.ts:76`, ahead of `src/main.ts:77`), so a value captured at construction would always be the default. Config is loaded once per launch and no runtime command changes `logEnabled`, so a change applies from the next launch (Assumptions 3, 7).
- Directory creation is lazy. The constructor only records the path (`src/activity-log/logger.ts:35`–`:39`); each append that passes the gate calls `mkdirSync` with `recursive: true` (`:25`) before appending (`:26`), a no-op once the directory exists. No flag tracks whether it was made. Ceiling: one extra syscall per logged entry, cheap because entries arrive per command, not per keystroke.
- An append returns at once when no directory is set, when the module `abandoned` flag is set, or when `getConfig().logEnabled` is false (`src/activity-log/logger.ts:22`). Returning before the `mkdirSync` keeps the directory absent under `logEnabled: false`; leaving the subscription intact keeps other `entry:appended` listeners receiving events (`:40`–`:46`).
- A failed write gives up for the run. The create and append share one `try`/`catch` (`:24`–`:30`): the first throw writes one dedicated stderr line with the error formatted by `errorText` (`:28`) and sets the module `abandoned` flag (`:29`, declared at `:12`), which every later append checks first. A constructor given a project directory resets `abandoned` (`:36`), mirroring `initNotificationRecord` at `src/notifications/record.ts:22`. The throw is not rethrown, so the bus prints no `message bus:` line, and the logger has no path to the notification manager, so no notification is raised (user answers: "Give up after one", "Own line", "No notification is raised").
- The failed-write test (`src/activity-log/logger.test.ts:214`) asserts the dedicated line with `/^activity log: write failed, not logging for the rest of this run: .+\n$/` (`:226`), requiring a non-empty error message after the prefix while allowing any platform's error wording. Its exactly-one-line, trailing-newline, and no-`message bus:` assertions (`:225`, `:227`, `:228`) are unchanged.
- Both inputs and outputs are logged as separate entries for the tab that ran them (`src/activity-log/logger.ts:44`–`:45`).
- `reapActivityLogs(launchedAt, days)` lives beside the logger (`src/activity-log/logger.ts:54`–`:56`) because the logger owns the directory path. With a module-private `DAY_MS` (`:14`), it returns without reaping when no directory has been set (`:55`) and otherwise calls `reapFilesOlderThan(logDir, '.json', launchedAt - days * DAY_MS)` (`:56`). The cutoff is fixed at launch, so the file this run appends to is never reaped during the run; a run that stays up for weeks keeps its activity logs until the next launch.
- The sweep is started from `src/main.ts:86`, unawaited with a swallowing rejection handler beside the other three sweeps (`:83`–`:85`). It is called unconditionally, ignoring `logEnabled`, and reads only `config.logRetentionInDays` (user answer "Always reap").
- The generic reaper is reused unchanged; its direct-entry, regular-file-only, extension-matching behavior keeps sibling files safe (`src/state/reaper.ts:16`).
- There is no migration of `.janissary/log/`; existing files there are left in place and never reaped (user answer: "Leave them").
- The `activityLog` registry entry has no `clear`, with a comment naming `reapActivityLogs` as the remover (`src/state/dirs.ts:98`–`:104`), matching the deliberate no-`clear` convention of the other persistent entries.
- The spec was renamed with the title, and the two comments citing the old name or path were updated: `src/remote/serve.ts:17` now says `.janissary/logs/activity/`, and `src/notifications/record.ts:10` cites `ActivityLogger`. `remote-serve` still writes no log of either kind.

## Preserved behavior

1. Each entry is still one `{"timestamp","agent","text"}` JSON line appended to the file for the local date; the rename and the move left the bytes unchanged. Test: `src/activity-log/logger.test.ts` "appends a JSON line to today's log file" (`:74`), moved from `src/transcript/logger.test.ts`.
2. A command's input and its output are still logged as separate entries for the tab that ran it; the gate does not drop either when `logEnabled` is true. Test: `src/controller.test.ts` "records transcript content in the activity log", renamed from "records transcript content in the append-only log".
3. Before a project directory is set, an append still writes nothing and does not throw; lazy creation does not resolve a path against the working directory or create anything there. Test: `src/activity-log/logger.test.ts` "writes nothing, rather than resolving the path against the working directory" (`:26`).
4. Command capture still collects every entry appended to its tab; the early returns and `abandoned` flag do not unsubscribe it. Test: `src/capture/execute-and-capture.test.ts` "collects every entry appended to the named tab while the run lasts, in order", kept unchanged; the `logEnabled: false` delivery case is pinned by `src/activity-log/logger.test.ts` "still delivers entries to other subscribers when logEnabled is false" (`:199`).
5. The shell transcript sweep still reaps `.txt` transcripts by the retention window; adding the activity log sweep did not change its directory, extension, or cutoff. Test: `src/shell/transcript/transcript-file.test.ts` "reaps .txt files older than the retention window".
6. The reaper still keeps files with another extension; the activity log sweep does not delete a non-`.json` file in its directory. Test: `src/state/reaper.test.ts` "keeps files whose names do not end with the extension".

## Assumptions

1. The daily log directory is set in one place: `src/activity-log/logger.ts:38` `logDir = path.join(projectDir, '.janissary', 'logs', 'activity');`.
2. Each entry is appended to a file named for the local date: `src/activity-log/logger.ts:23` `` path.join(logDir, `${getDateStr()}.json`) ``, and `src/datetime.ts:3` `const y = now.getFullYear();` reads local, not UTC, fields.
3. The logger is constructed by the state-directory registry before the config is loaded: `src/state/dirs.ts:103` `init: (projectDir: string): void => { new ActivityLogger(projectDir); },` runs from `src/main.ts:76` `initStateDirectories(`, ahead of `src/main.ts:77` `const config = loadConfig(cwd);`. Before `loadConfig`, `getConfig` answers the defaults: `src/config.ts:118` `let config: Config = { ...DEFAULT_CONFIG };`.
4. The logger's only production caller is the registry entry; its importers are `src/state/dirs.ts:14`, `src/state/dirs.test.ts:64`, `src/state/dirs.test.ts:72`, and `src/controller.test.ts:10`.
5. The spec is `product/specs/activity-log.md`, titled `# Activity Log`, and no spec, help page, or `ai/` file links to `append-only-log`.
6. `src/transcript/` held only `logger.ts`, `logger.test.ts`, and `types.ts`, and was removed; `ActivityLogRecord` is imported only by `src/activity-log/logger.ts:3`.
7. No runtime command changes `logEnabled`. `updateConfig` is called only for `syntaxTheme`, `theme`, and `pluginSettings`: `src/commands/theme.ts:27` `updateConfig({ theme: canonical })`, `src/plugins/settings.ts:15` `updateConfig({ pluginSettings:`.
8. A throwing bus listener is caught and reported to stderr by the bus: `src/bus.ts:27` `` process.stderr.write(`message bus: ${channel}:${type} listener failed: ${errorText(error)}\n`); ``.
9. `janus remote-serve` says in a comment that it writes nothing to the activity log directory: `src/remote/serve.ts:17`.
10. The `logEnabled` and `logRetentionInDays` comments name activity logs alongside transcripts and captures: `src/config.ts:50` and `:54`.
11. The specs that list what `logEnabled` and `logRetentionInDays` govern, and what is kept across launches, are `product/specs/application-config.md:16` and `:17` and `product/specs/state-directory.md:5`.

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The shell transcript reaper wrapper, with the day arithmetic and uninitialized guard, that the new wrapper mirrors: `src/shell/transcript/transcript-file.ts:26` `reapShellTranscripts`.
3. The background launch sweep, started unawaited after the config loads: `src/main.ts:82`–`:86`.
4. The give-up-after-first-failure flag on an append-only record: `src/notifications/record.ts:19` `let abandoned = false;`, checked at `:93` `if (!recordPath || abandoned) return;`, reset at `:22`.
5. The state-directory registry entries deliberately left without a `clear`: `src/state/dirs.ts:98`–`:104`.
6. The error formatter used for the dedicated stderr line: `src/error-text.ts:1` `export function errorText(error: unknown): string {`.
7. The test pattern for overriding `logEnabled`: `src/harness/observers.test.ts:114` `vi.spyOn(config, 'getConfig').mockReturnValue({ ...defaults, logEnabled: false });`.

## Implementation steps

The work landed in five steps, each leaving the tree green under `$janissary/scripts/run.mjs check-diff`. The ready plan `product/plans/ready/recording-retention-reaper.md` also edits the launch sweep in `src/main.ts`, `src/state/dirs.ts`, the two config rows, and `product/specs/state-directory.md:5`; the two changes were kept side by side on those shared lines.

1. **Rename and move the logger.** Moved `src/transcript/logger.ts`, `src/transcript/types.ts`, and `src/transcript/logger.test.ts` to `src/activity-log/` and removed `src/transcript/`; renamed `TranscriptLogger` to `ActivityLogger` and `LogRecord` to `ActivityLogRecord`. Pointed the directory at `.janissary/logs/activity`. In `src/state/dirs.ts`, imported from `../activity-log/logger.js`, renamed the registry entry and its `KNOWN_STATE_DIRECTORY_KEYS` key from `transcriptLog` to `activityLog`, and added the "No `clear`, deliberately" comment naming `reapActivityLogs`. Repointed `src/state/dirs.test.ts` and `src/controller.test.ts`, renamed the controller test to "records transcript content in the activity log", and updated the moved logger test's path expectations. Updated the comments in `src/remote/serve.ts` and `src/notifications/record.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Gate on `logEnabled`, create the directory lazily, and give up after a failure.** In `src/activity-log/logger.ts`, the constructor records the directory path, resets `abandoned`, and subscribes without creating the directory. `ActivityLogger.append` returns at once for no directory, `abandoned`, or `getConfig().logEnabled === false`; otherwise it creates the directory recursively and appends the line. Any throw writes the single dedicated stderr line with `errorText(error)`, sets `abandoned`, and returns without rethrowing. Replaced "creates the log directory on init" with the lazy-creation test and added the gating, other-subscriber, and failure tests. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Reap at launch.** Added `reapActivityLogs(launchedAt, days)` with a module-private `DAY_MS` beside the logger, and started it unawaited from `src/main.ts` beside the other three sweeps. Widened the `logEnabled` and `logRetentionInDays` comments in `src/config.ts` to include activity logs. Added `src/activity-log/reap.test.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Specs.** Renamed `product/specs/append-only-log.md` to `product/specs/activity-log.md` and retitled it `# Activity Log`, replacing the old directory and term, and rewrote § Log rotation and § Lifecycle around local-day naming, the launch sweep, lazy creation, the `logEnabled` gate, and the one-line failure message. Extended the `logEnabled` and `logRetentionInDays` rows of `product/specs/application-config.md` with activity logs and `.json` files, and the kept-and-swept sentence of `product/specs/state-directory.md:5` with activity logs and a `[[activity-log]]` link. Build command: `$janissary/scripts/run.mjs check-diff`.
5. **Harden the failed-write assertion.** In `src/activity-log/logger.test.ts:226`, strengthened the dedicated-line assertion to require a non-empty error message after the prefix before the trailing newline, without naming an OS-specific error string; the exactly-one-line, trailing-newline, and no-`message bus:` assertions stayed as they were. No production code changed. Build command: `$janissary/scripts/run.mjs check-diff`.

Rebase adaptation: `master` advanced with the recording-retention work while this pull request was open. It replaced the four direct sweep calls in `src/main.ts` with `startLaunchSweeps` in the new `src/launch-sweeps.ts`, retired the `recordShellTabs` config key by folding recording gating into `logEnabled`, and rewrote the two config rows and the state-directory sentence around recordings. `reapActivityLogs` now joins the sweep list in `src/launch-sweeps.ts` instead of being called directly from `src/main.ts`, the activity-log comment in `src/state/dirs.ts` names its new caller, and those shared comments and spec rows name recordings and activity logs side by side. No behavior from this plan was dropped.

## Tests

- `src/activity-log/logger.test.ts`, moved from `src/transcript/logger.test.ts` with paths updated to `.janissary/logs/activity`: "writes nothing, rather than resolving the path against the working directory" (`:26`), "creates no directory until the first entry is written" (`:62`), "logDir returns the log directory path" (`:69`), "appends a JSON line to today's log file" (`:74`), "writes nothing under .janissary/log" (`:87`), "appends to an existing log file" (`:94`), "writes valid JSON on each line" (`:104`), "handles empty text" (`:116`), "handles special characters in text" (`:126`), "writes no entry and creates no directory when logEnabled is false" (`:190`), "still delivers entries to other subscribers when logEnabled is false" (`:199`), and "prints one stderr line and stops writing after a failed write" (`:214`). The last asserts at `:225`–`:228` exactly one stderr line, the regex `/^activity log: write failed, not logging for the rest of this run: .+\n$/` with a non-empty error message and no pinned OS string, the trailing newline, and no `message bus:` line (Requirements 1, 2, 4, 5, 9–12, 21, 22, 24–26; Preserved behavior 1, 3, 4).
- `src/activity-log/reap.test.ts`, new because `vi.mock` is hoisted to the whole file and would stub the reaper under the I/O tests: "reaps .json files older than the retention window" (`:28`), asserting one reaper call with the activity directory, `.json`, and `launchedAt - 7 * 86_400_000`; "uses launch as the cutoff when retention is zero" (`:40`); and "reaps nothing before a directory has been chosen" (`:47`) (Requirements 13–15, 18, 19).
- `src/state/dirs.test.ts`: repointed to `ActivityLogger` and added "never clears the activity log directory", asserting the `activityLog` entry has no `clear` (Requirements 6, 20).
- `src/controller.test.ts`: the renamed "records transcript content in the activity log" still asserts input and output are separate entries (Preserved behavior 2).
- Requirement 3 is met by writing no code that touches `.janissary/log/`. Requirements 16 and 17 are the unconditional, unawaited, rejection-handled call in `src/main.ts:86`, which has no test file. Requirement 23 holds because the logger has no path to the notification manager. Requirements 7 and 8 are spec files. The capture, shell transcript, and generic reaper tests stay unchanged and pin Preserved behavior 4–6.

## Out of scope

- No migration, move, or cleanup of files already in `.janissary/log/` (user answer: "Leave them").
- No change to the entry format, the daily file name, or what is logged (user answer: "Entry format & daily file").
- No recurring sweep while the app runs. Reaping happens once per launch.
- No new config key. `logEnabled` and `logRetentionInDays` are shared.
- No notification for a failed write (user answer: "Give up after one").
- No assertion of a platform-specific OS error string such as `ENOTDIR` or `ENOENT`.
- The stale `.janissary/log/server.log` paths in `ai/tasks/` and `ai/guidelines/sandbox-e2e-browser.md` are left for the server-log backlog item, which moves the server log again (user answer: "Leave for server-log").
- `janus remote-serve` still writes no activity log. Only its comment changed.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **New location, lazy directory.** In a scratch project with an existing `.janissary/log/2026-01-01.json`, launch Janissary. `.janissary/logs/activity/` does not exist yet. Run `help` in the janus tab: `.janissary/logs/activity/<today>.json` appears, holding a `{"timestamp","agent":"janus","text":"help"}` line and a separate output line. `.janissary/log/2026-01-01.json` is untouched and nothing new is written under `.janissary/log/`. Failure looks like the directory existing before the first command, or a new file under `.janissary/log/`.
3. **The sweep ages logs out.** With Janissary stopped, backdate one activity log by ten days with `touch -t`, leave another current, and drop a ten-day-old `notes.txt` beside them. Backdate `.janissary/logs/notifications.json` by ten days too. Relaunch with the default config. Within a few seconds the backdated `.json` is gone. The current one, `notes.txt`, `notifications.json`, and `server.log` remain, and the UI opened without waiting. Set `"logRetentionInDays": 0` and relaunch: every activity log from earlier runs is gone, and the file written after that relaunch is kept. Failure looks like a backdated `.json` surviving, or any file outside `.janissary/logs/activity/` deleted.
4. **`logEnabled` off.** Remove `.janissary/logs/activity/`, set `"logEnabled": false`, and relaunch. Run several commands: `.janissary/logs/activity/` is never created, and each command's output still appears in the janus tab. Put back a ten-day-old activity log while Janissary is stopped and relaunch with `logEnabled` still false: it is deleted. Failure looks like the directory appearing, or the old file surviving.
5. **Write failure.** With `logEnabled` true and Janissary stopped, create `.janissary/logs/activity` as a regular file instead of a directory. Launch and run two commands. `.janissary/logs/server.log` holds exactly one `activity log: write failed, not logging for the rest of this run: ...` line, with a non-empty error message after the prefix, and no `message bus: transcript:entry:appended listener failed` line, and no notification appears. Failure looks like a line per command, a prefix with no error message, a bus line, or a notification.
