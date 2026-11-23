# Rename the daily transcript logger to ActivityLogger, move its directory to .janissary/logs/activity/, and rename the state-directory key to activityLog

**Complexity: 5/10** — ~54 added production lines across the moved module and type, 3 existing production files edited, 7 requirements, 7 scenarios, 2 renamed units (p=5.30)

Source plan: `./product/plans/complete/activity-logs.md`. Depends on no earlier subplan; this is the first of four that decompose that plan.

## Goal

The feature text names the `<YYYY-MM-DD>.json` files under `.janissary/log/` as activity logs and moves them to `.janissary/logs/activity/`, and renames `TranscriptLogger` to `ActivityLogger`. This subplan delivers the rename and the move only: the files, the class, the record type, the directory path, and the state-directory key. The gate on `logEnabled`, lazy directory creation, give-up after a write failure, the launch reaper, and all spec edits belong to later subplans. Moving the writes is what makes the other three subplans possible, because they all key off the new module and directory.

## Requirements

1. Each activity log entry is appended to `.janissary/logs/activity/<YYYY-MM-DD>.json` ("moved to .janissary/logs/activity/").
2. No entry is written under `.janissary/log/` ("moved to .janissary/logs/activity/").
3. Files already in `.janissary/log/` are not moved, deleted, or reaped (user answer: "Leave them").
4. The logger class is named `ActivityLogger` ("TranscriptLogger → ActivityLogger").
5. The logger module lives at `src/activity-log/logger.ts`, its record type at `src/activity-log/types.ts` as `ActivityLogRecord`, and `src/transcript/` is removed (user answer: "All the names").
6. The logger's state-directory registry key is `activityLog` (user answer: "All the names").
7. `.janissary/logs/activity/` is never cleared at launch (the existing spec: "The directory is never cleared").

## Design decisions

- Move `src/transcript/logger.ts`, `src/transcript/types.ts`, and `src/transcript/logger.test.ts` into a new `src/activity-log/` directory, rename `TranscriptLogger` to `ActivityLogger` and `LogRecord` to `ActivityLogRecord`, then remove the now-empty `src/transcript/` (user answer "All the names"; Assumptions 1, 4, 5). The move keeps the entry format and daily file name byte-for-byte; only the path and the names change.
- Point the logger's directory at `path.join(projectDir, '.janissary', 'logs', 'activity')` (Assumption 1). This is the single place the directory is chosen, so one edit moves every write.
- Rename the state-directory registry entry and its `KNOWN_STATE_DIRECTORY_KEYS` member from `transcriptLog` to `activityLog` in the same change, and give the entry a "No `clear`, deliberately" comment naming `reapActivityLogs` as the remover (Assumption 8). `reapActivityLogs` is delivered by the third subplan; naming it in a comment here creates no code dependency, and the entry has no `clear` in this subplan just as it has none today.
- Migrate every consumer of the renamed symbols in this subplan, not in a later one: `src/state/dirs.ts`, `src/state/dirs.test.ts`, `src/controller.test.ts`, and the moved logger test (Assumption 3). A later subplan may build on `ActivityLogger`, but none may start with a dangling `TranscriptLogger` reference.
- In this subplan the constructor still creates the directory when it is given a project directory. Removing that side effect and creating on first write is the second subplan's job, so the existing "creates the log directory on init" test stays green here and is only repointed to the new path.
- Leave `.janissary/log/` untouched. No migration, move, or cleanup of its existing files, and no code path that writes there (Assumption 6).
- Update the two comments that cite the old name or path: `src/remote/serve.ts` says it writes nothing to `.janissary/log/`, and `src/notifications/record.ts` says its record is modelled on `TranscriptLogger` (Assumptions 6, 7). These are comment-only edits; `remote-serve` still writes no log of either kind.
- The ready plan `product/plans/ready/recording-retention-reaper.md` also edits `src/state/dirs.ts`. The two edits are to different registry entries, so both survive in either landing order; this subplan changes only the transcript/activity entry and its key.

## Preserved behavior

1. Each entry is still one `{"timestamp","agent","text"}` JSON line appended to the file for the local date; the rename and move must not change the bytes written or split a day across files, and must not write to `.janissary/log/` instead. Test: `src/transcript/logger.test.ts` "appends a JSON line to today's log file", which moves to `src/activity-log/logger.test.ts`.
2. A command's input and its output are still logged as separate entries for the tab that ran it; the rename must not collapse the two entries into one. Test: `src/controller.test.ts` "records transcript content in the append-only log", renamed "records transcript content in the activity log".
3. Before a project directory is set, an append still writes nothing and does not throw; the new path must not be resolved against the working directory or create anything there. Test: `src/transcript/logger.test.ts` "writes nothing, rather than resolving the path against the working directory", which moves to `src/activity-log/logger.test.ts`.

## Assumptions

1. The daily log directory is set in one place: `src/transcript/logger.ts:25` `logDir = path.join(projectDir, '.janissary', 'log');`.
2. Each entry goes to a file named for the local date: `src/transcript/logger.ts:17` `` path.join(logDir, `${getDateStr()}.json`) ``, and `src/datetime.ts:3` `const y = now.getFullYear();` reads local fields, not UTC.
3. The logger has one production importer, `src/state/dirs.ts:14` `import { TranscriptLogger } from '../transcript/logger.js';`, and its test importers are `src/state/dirs.test.ts:64`, `src/state/dirs.test.ts:72`, and `src/controller.test.ts:10` `import { TranscriptLogger } from './transcript/logger.js';`.
4. `LogRecord` is imported only by the logger: `src/transcript/types.ts:1` `export type LogRecord = {` and `src/transcript/logger.ts:3` `import type { LogRecord } from './types.js';`.
5. `src/transcript/` holds only `logger.ts`, `logger.test.ts`, and `types.ts`.
6. `janus remote-serve` documents that it writes nothing to the old directory: `src/remote/serve.ts:17` "and writes nothing to `.janissary/log/`".
7. The notification record comment cites the old class: `src/notifications/record.ts:10` "Modelled on `TranscriptLogger`".
8. The state-directory entry and its key are both named `transcriptLog`: `src/state/dirs.ts:99` `name: 'transcriptLog',` and `src/state/dirs.ts:110` `'remoteFileCache', 'remoteSessions', 'notificationRecord', 'transcriptLog',`.

## Existing functionality

1. The newline-delimited JSON append the logger already uses: `src/transcript/logger.ts:18` `appendFileSync(logPath, JSON.stringify(entry) + '\n')`, kept unchanged.
2. The local-date file-name helper: `src/datetime.ts:1` `export function getDateStr(): string {`.
3. The state-directory registry and its deliberate no-`clear` convention: `src/state/dirs.ts:27` "No `clear`, deliberately".

## Implementation steps

1. Move the three files under `src/transcript/` to `src/activity-log/`, rename the class and the record type, change the directory to `.janissary/logs/activity`, and delete the empty `src/transcript/` directory. Update every importer in the same edit: `src/state/dirs.ts` (import, the registry entry name, its `init` call, the "No `clear`, deliberately" comment naming `reapActivityLogs`, and `KNOWN_STATE_DIRECTORY_KEYS`), `src/state/dirs.test.ts` (the `vi.mock` path, the static import, the expectation, and a new "never clears the activity log directory" case asserting the `activityLog` entry has no `clear`), and `src/controller.test.ts` (import and the renamed test). Update the moved logger test's path expectations from `.janissary/log` to `.janissary/logs/activity`: keep "creates the log directory on init" and "logDir returns the log directory path" repointed to the new path, and add "writes nothing under .janissary/log" asserting `.janissary/log` does not exist after an append. The "covers exactly the keys the registry is pinned against" case in `src/state/dirs.test.ts` still asserts 14 entries; renaming a key does not change the count. Update the comments in `src/remote/serve.ts` and `src/notifications/record.ts`. The file set sufficient for a green build is exactly the moved module and type plus `src/state/dirs.ts`, `src/state/dirs.test.ts`, `src/controller.test.ts`, `src/remote/serve.ts`, and `src/notifications/record.ts`; no later subplan is needed to compile it. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Verify the rename left no production or test reference to `TranscriptLogger`, `LogRecord`, `transcriptLog`, or `src/transcript/`, and that a launch writes to the new path while a pre-existing `.janissary/log/<date>.json` stays untouched. Keep the other three plans' changes out of this subplan: no config gate, no lazy creation, no reaper, no spec edits. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This subplan changes only file paths, module and type names, a state-directory key, and two comments; it adds or alters no surface the user sees or operates.

## Tests

- `src/activity-log/logger.test.ts`, moved from `src/transcript/logger.test.ts` with the "before a directory is configured" block kept first because the directory is module state with no reset: the existing "appends a JSON line to today's log file" and "writes nothing, rather than resolving the path against the working directory" cases now assert `.janissary/logs/activity` (Requirements 1, 2, 4, 5; Preserved behavior 1 and 3). Add "writes nothing under .janissary/log" (Requirement 2).
- `src/state/dirs.test.ts`: repoint the mock and import to `../activity-log/logger.js` and the expectation to `ActivityLogger`; add "never clears the activity log directory", asserting the `activityLog` entry has no `clear` (Requirements 6, 7).
- `src/controller.test.ts`: the renamed "records transcript content in the activity log" still proves input and output are separate entries (Preserved behavior 2).
- Requirement 3 is met by writing no code that touches `.janissary/log/`; it is confirmed in Verification, not by a new test.

## Out of scope

- No gating on `logEnabled`, no lazy directory creation, and no give-up-after-failure handling; those belong to the second subplan.
- No `reapActivityLogs` implementation, no `src/main.ts` sweep, and no config comment changes; those belong to the third subplan.
- No spec renames or edits; those belong to the fourth subplan.
- No migration, move, or cleanup of files already in `.janissary/log/` (user answer: "Leave them").
- No change to the entry format, the daily file name, or what is logged (user answer: "Entry format & daily file").
- The stale `.janissary/log/server.log` paths in `ai/tasks/` and `ai/guidelines/sandbox-e2e-browser.md` are left for the server-log backlog item (user answer: "Leave for server-log").

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. In a scratch project, create `.janissary/log/2026-01-01.json` with a line in it, launch Janissary, and run `help` in the janus tab. A file `.janissary/logs/activity/<today>.json` now holds a `{"timestamp","agent":"janus","text":"help"}` line and a separate output line, while `.janissary/log/2026-01-01.json` is unchanged and nothing new appears under `.janissary/log/`. Also grep `src/` for `TranscriptLogger`, `LogRecord`, `transcriptLog`, and `src/transcript/` and find no hits. Failure looks like the old path still receiving writes, an old symbol surviving, or a new file under `.janissary/log/`.
