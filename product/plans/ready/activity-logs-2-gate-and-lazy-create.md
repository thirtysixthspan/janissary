# Gate the activity logger on logEnabled, create its directory on first write, and stop after one failed write

**Complexity: 4/10** — ~35 added lines in one production module, 8 requirements, 8 scenarios including the failure and bus-isolation paths (p=5.01)

Source plan: `./product/plans/complete/activity-logs.md`. Depends on `./product/plans/ready/activity-logs-1-rename-and-move.md`, which supplies `ActivityLogger`, `ActivityLogRecord`, `src/activity-log/logger.ts`, and the `activityLog` registry key.

## Goal

The feature text says the new activity logs "should be reaped and gated by logEnabled". This subplan delivers the write-side half: `logEnabled: false` stops activity log writes without stopping the message bus, the directory appears only when the first entry is actually written, and the first failed write prints one dedicated stderr line and abandons logging for the rest of the run without raising a notification or throwing into the bus. The launch-time age sweep is the third subplan; the spec edits are the fourth.

## Requirements

1. With `"logEnabled": false`, no activity log entry is written ("gated by logEnabled").
2. With `"logEnabled": false`, `.janissary/logs/activity/` is not created (user answer: "Create on first write").
3. With `"logEnabled": true`, `.janissary/logs/activity/` is created when the first entry is written, not at launch (user answer: "Create on first write").
4. With `"logEnabled": false`, another `entry:appended` subscriber still receives every entry (user answer: "Bus subscribers").
5. The first failed activity log write prints exactly `activity log: write failed, not logging for the rest of this run: <error message>` to stderr, one line (user answer: "Own line").
6. After the first failed write, no further write is attempted and no further line is printed for the rest of the run (user answer: "Give up after one").
7. A failed write raises no notification (user answer: "No notification is raised").
8. A failed write does not throw into the message bus, so the bus prints no `message bus: transcript:entry:appended listener failed` line for it (user answer: "Own line").

## Design decisions

- Read `getConfig().logEnabled` inside `ActivityLogger.append` on every call, not in the constructor. The state-directory registry constructs the logger before `loadConfig` runs, so a value captured at construction would always be the default `true` (Assumption 1). Config is loaded once per launch and no runtime command changes `logEnabled`, so a change applies from the next launch (Assumption 2).
- Keep the constructor's only filesystem effect to recording the directory path: it no longer calls `mkdirSync`. Each append that passes the gate calls `mkdirSync` with `recursive: true` before appending, which is a no-op once the directory exists; no flag tracks whether it was made (user answer "Create on first write"; Assumption 3). Ceiling: one extra syscall per logged entry, which is cheap because entries arrive per command, not per keystroke. If logging ever becomes high-frequency, add a module flag reset by the constructor so the create runs once per directory.
- The append returns at once when no directory is set, when a module `abandoned` flag is set, or when `getConfig().logEnabled` is false (Assumptions 1, 4). Returning before the `mkdirSync` is what keeps the directory absent under `logEnabled: false`, and leaving the subscription intact is what keeps other `entry:appended` listeners receiving events.
- On the first create or append that throws, catch it inside the logger, write one stderr line with the error formatted by `errorText`, set `abandoned`, and return without rethrowing (user answers "Own line", "Give up after one"; Assumptions 5, 6). The stderr line is the logger's own, not the bus's, so no `message bus:` line appears. A constructor given a project directory resets `abandoned` to false, the way `initNotificationRecord` resets its own at `src/notifications/record.ts:22` `abandoned = false;`.
- Give the logger no path to the notification manager, so a failed write cannot raise a notification (Requirement 7). Do not add one.
- Keep the entry format, the daily file name, and the two-entry input/output split exactly as delivered by the first subplan; the gate must not drop either entry when `logEnabled` is true.

## Preserved behavior

1. Command capture still collects every entry appended to its tab; the new early returns and the `abandoned` flag must not unsubscribe capture or stop the bus delivering to it. Test: `src/capture/execute-and-capture.test.ts` "collects every entry appended to the named tab while the run lasts, in order", kept unchanged. The `logEnabled: false` delivery case is pinned separately by the logger test's second subscriber in this subplan.

## Assumptions

1. The registry constructs the logger before the config loads: `src/state/dirs.ts:100` `init: (projectDir: string): void => { new TranscriptLogger(projectDir); },` runs from `src/main.ts:75` `initStateDirectories(`, ahead of `src/main.ts:76` `const config = loadConfig(cwd);`. Before `loadConfig`, `getConfig` answers the defaults: `src/config.ts:118` `let config: Config = { ...DEFAULT_CONFIG };`. The first subplan renames the class and key but not the ordering.
2. No runtime command changes `logEnabled`: the production `updateConfig` callers are `src/commands/theme.ts:18` `updateConfig({ syntaxTheme: canonical })`, `src/commands/theme.ts:27` `updateConfig({ theme: canonical })`, `src/commands/syntax.ts:36` `updateConfig({ syntaxTheme: canonical })`, and `src/plugins/settings.ts:15` `updateConfig({ pluginSettings:`. Other calls to `updateConfig` appear only in test files.
3. The constructor currently creates the directory: `src/transcript/logger.ts:26` `mkdirSync(logDir, { recursive: true });`, and the append simply writes: `src/transcript/logger.ts:18` `appendFileSync(logPath, JSON.stringify(entry) + '\n');`. Both lines move with the module in the first subplan.
4. The no-directory guard already exists: `src/transcript/logger.ts:16` `if (!logDir) return;`, so an early return needs no new path resolution and creates nothing in the working directory.
5. The give-up-flag precedent is `src/notifications/record.ts:19` `let abandoned = false;`, checked at `src/notifications/record.ts:93` `if (!recordPath || abandoned) return;`.
6. The error formatter the bus uses for its own stderr line is `src/error-text.ts:1` `export function errorText(error: unknown): string {`; the bus's line is `src/bus.ts:27` `` process.stderr.write(`message bus: ${channel}:${type} listener failed: ${errorText(error)}\n`); ``, which the logger must not produce.
7. The test pattern for overriding `logEnabled` is `src/harness/observers.test.ts:114` `vi.spyOn(config, 'getConfig').mockReturnValue({ ...defaults, logEnabled: false });`.

## Existing functionality

1. The `abandoned` give-up flag and its constructor reset on an append-only record: `src/notifications/record.ts:19` `let abandoned = false;` and `src/notifications/record.ts:22` `abandoned = false;`.
2. The shared error formatter: `src/error-text.ts:1` `export function errorText(error: unknown): string {`.
3. The message bus's per-listener isolation, which is why a throwing listener would otherwise print its own line: `src/bus.ts:97` the `try { fn(event); }` loop and `src/bus.ts:115` `this.onListenerError(String(channel), event.type, error);`.
4. The config getter the gate reads: `src/config.ts:118` `let config: Config = { ...DEFAULT_CONFIG };`.

## Implementation steps

1. In `src/activity-log/logger.ts`, change the constructor to record the directory path, reset `abandoned`, and subscribe without calling `mkdirSync`. Add the module `abandoned` flag. In `ActivityLogger.append`, return early for no directory, for `abandoned`, and for `getConfig().logEnabled === false`; otherwise call `mkdirSync` recursively and then append the JSON line. Wrap the create and append in one `try`/`catch` that writes the single `activity log: write failed, not logging for the rest of this run: ` line plus `errorText(error)` and a newline to stderr, sets `abandoned`, and returns without rethrowing. Use direct imports with the `.js` extension for `getConfig` and `errorText`. No other production file changes in this subplan. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/activity-log/logger.test.ts`, replace "creates the log directory on init" with "creates no directory until the first entry is written": construct the logger, assert `.janissary/logs/activity` is absent, append, then assert it exists. Add "writes no entry and creates no directory when logEnabled is false", "still delivers entries to other subscribers when logEnabled is false" (the second listener is called and `messageBus.emit` reports no failures), and "prints one stderr line and stops writing after a failed write" (make the project path a regular file so the directory cannot be created, spy `process.stderr.write`, append twice, assert exactly one write of the dedicated line with the error text and no `message bus:` line). Keep the "before a directory is configured" block first. The file set sufficient for a green build is the single production module plus this test; nothing in `src/main.ts`, `src/config.ts`, or the specs changes here. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This subplan changes write-side behavior, one stderr line, and tests; it adds or alters no surface the user sees or operates in the app.

## Tests

- `src/activity-log/logger.test.ts`: "creates no directory until the first entry is written" (Requirement 3); "writes no entry and creates no directory when logEnabled is false" (Requirements 1, 2); "still delivers entries to other subscribers when logEnabled is false", asserting the second listener still runs and `messageBus.emit` returns no failures (Requirement 4); "prints one stderr line and stops writing after a failed write", asserting exactly one dedicated stderr write, a second append writes nothing more, and no `message bus:` line appears (Requirements 5, 6, 8).
- `src/capture/execute-and-capture.test.ts`: keep "collects every entry appended to the named tab while the run lasts, in order" passing unchanged (Preserved behavior 1). No test is added to this file.
- Requirement 7 holds because the logger has no path to the notification manager; it is confirmed in Verification, not by a new test.

## Out of scope

- No `reapActivityLogs` function, no `src/main.ts` sweep, and no `logRetentionInDays` work; those belong to the third subplan.
- No `src/config.ts` comment edits and no spec edits; those belong to the third and fourth subplans respectively.
- No change to the entry format, the daily file name, the directory location, the class name, or the state-directory key; those were delivered by the first subplan.
- No recurring sweep while the app runs and no new config key; `logEnabled` and `logRetentionInDays` are shared.
- No notification for a failed write (user answer: "Give up after one").

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Remove `.janissary/logs/activity/`, set `"logEnabled": false`, and relaunch. Run several commands: the directory is never created, no activity log line appears, and each command's output still appears in the janus tab. Then set `"logEnabled": true` and relaunch without the directory present: it is still absent immediately after launch and appears only after the first command writes an entry. Failure looks like the directory appearing at launch, a file written under `logEnabled: false`, or a second stderr line after a failed write.
3. With `logEnabled` true and Janissary stopped, create `.janissary/logs/activity` as a regular file instead of a directory. Launch and run two commands. The log holds exactly one `activity log: write failed, not logging for the rest of this run: ...` line, no `message bus: transcript:entry:appended listener failed` line, and no notification appears. Failure looks like a line per command, a bus line, or a notification.
