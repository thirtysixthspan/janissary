# Reap activity logs by age in the background launch sweep

**Complexity: 4/10** — 7 requirements, 3 production files edited, 6 reaper scenarios, 1 new function (p=4.99)

Source plan: `./product/plans/complete/activity-logs.md`. Depends on `./product/plans/ready/activity-logs-2-gate-and-lazy-create.md`, which supplies the gate and the completed `ActivityLogger` module; transitively on `./product/plans/ready/activity-logs-1-rename-and-move.md`, which supplies `src/activity-log/logger.ts` and the `activityLog` directory path.

## Goal

The feature text says the new activity logs "should be reaped" and links them to `logRetentionInDays`. This subplan adds the launch-time age sweep: a `reapActivityLogs` wrapper beside the logger, started unawaited from `src/main.ts` with the other three sweeps, using the shared `logRetentionInDays` value and ignoring `logEnabled`. It also widens the two config comments to name activity logs. The spec edits are the fourth subplan.

## Requirements

1. The launch sweep deletes an activity log last modified more than `logRetentionInDays` days before launch ("these logs should be reaped"; user answer: "Last modified").
2. A `logRetentionInDays` of `0` deletes every activity log last modified before launch (the shared key's existing meaning, "with `0` keeping none from earlier runs").
3. The sweep never deletes an activity log last modified at or after launch, including when `logRetentionInDays` is `0` (user answer: "A file touched during this run is never reaped").
4. The sweep runs once per launch, in the background, without delaying startup (user answer: "Same rule as transcripts, captures, and recordings").
5. The sweep runs whether `logEnabled` is true or false (user answer: "Always reap").
6. The sweep considers only regular `.json` files directly inside `.janissary/logs/activity/` (user answer: "Sibling files safe").
7. The sweep never deletes `.janissary/logs/server.log`, `.janissary/logs/notifications.json`, or anything else outside `.janissary/logs/activity/` (user answer: "Sibling files safe").

## Design decisions

- Add `reapActivityLogs(launchedAt, days)` to `src/activity-log/logger.ts` with a module-private `DAY_MS`, mirroring `reapShellTranscripts`. It reads the logger's module-level directory variable directly, takes no directory parameter, returns without reaping when that variable is still empty, and otherwise calls `reapFilesOlderThan(<activity directory>, '.json', launchedAt - days * DAY_MS)` (user answer "Last modified"; Assumptions 1, 2). It lives beside the logger because the logger owns the directory path; a module just to share one string would be larger. Constructing no logger before boot leaves the variable empty, which is what the uninitialized-guard test simulates with a fresh import.
- Start the sweep from `src/main.ts` beside the other three, unawaited with a swallowing rejection handler, using the config value already loaded (Assumptions 3, 4). The cutoff is fixed at launch time minus `logRetentionInDays` days, so today's file, which this run keeps appending to, is never reaped during the run. Ceiling: a run that stays up for weeks keeps every activity log it writes until the next launch.
- The sweep ignores `logEnabled` (user answer "Always reap"). It is called unconditionally, outside any gate, and reads only `config.logRetentionInDays`.
- Reuse `reapFilesOlderThan` unchanged. Its direct-entry, regular-file-only, extension-matching behavior is what makes Requirements 6 and 7 true, and it never rejects (Assumption 5).
- Widen the `logEnabled` and `logRetentionInDays` comments in `src/config.ts` to name activity logs, keeping the existing statements about transcripts, captures, and the shared key's semantics (Assumption 6).
- The ready plan `product/plans/ready/recording-retention-reaper.md` also adds a sweep line in `src/main.ts` and widens these same two `src/config.ts` comments. Whichever plan lands second must keep both additions: two unawaited sweep calls beside the existing three, and comment text naming recordings as well as activity logs. Neither plan depends on the other.

## Preserved behavior

1. The shell transcript sweep still reaps `.txt` transcripts by the retention window; adding the activity log sweep must not change its directory, extension, or cutoff. Test: `src/shell/transcript/transcript-file.test.ts` "reaps .txt files older than the retention window".
2. The reaper still keeps files with another extension; the activity log sweep must not delete a non-`.json` file in its directory. Test: `src/state/reaper.test.ts` "keeps files whose names do not end with the extension".

## Assumptions

1. The generic age-based reaper already exists and is scoped to one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `export async function reapFilesOlderThan(directory: string, extension: string, cutoffMs: number): Promise<void> {`.
2. The shell transcript wrapper is the shape to mirror, including the day arithmetic and uninitialized guard: `src/shell/transcript/transcript-file.ts:26` `export async function reapShellTranscripts(launchedAt: number, days: number): Promise<void> {` and `src/shell/transcript/transcript-file.ts:29` `await reapFilesOlderThan(transcriptDirectory, '.txt', launchedAt - days * DAY_MS);`.
3. The launch sweep runs in the background after the config loads: `src/main.ts:81` "The launch sweep runs in the background; boot never waits for it." and `src/main.ts:84` `void reapShellTranscripts(Date.now(), config.logRetentionInDays).catch(() => {});`.
4. `config` is loaded before the sweeps: `src/main.ts:76` `const config = loadConfig(cwd);`.
5. `reapFilesOlderThan` skips non-files and other extensions and never rejects: `src/state/reaper.ts:16` `if (!entry.isFile() || !entry.name.endsWith(extension)) continue;` and `src/state/reaper.ts:20` `if (info.mtimeMs < cutoffMs) await unlink(filePath);`.
6. The two comments name only harness and shell transcripts and captures today: `src/config.ts:50` "Whether harness and shell transcript files are written at all" and `src/config.ts:54` "How many days a harness or shell transcript, or a harness capture file, is kept".
7. The capture and shell sweep tests own their own mocks of the reaper, so a new test file is needed for the activity reaper: `src/shell/transcript/transcript-file.test.ts:16` `vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));`.

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The shell transcript reaper wrapper, with the day arithmetic and uninitialized guard, to mirror: `src/shell/transcript/transcript-file.ts:26` `reapShellTranscripts`.
3. The background launch sweep, started unawaited after the config loads: `src/main.ts:84` `void reapShellTranscripts(Date.now(), config.logRetentionInDays).catch(() => {});`.
4. The state-directory registry entry left without a `clear`, which names `reapActivityLogs` as its remover: `src/state/dirs.ts:98`–`:101`, delivered by the first subplan.
5. The mocked-reaper test pattern that keeps I/O tests and reaper tests in separate files: `src/shell/transcript/transcript-file.test.ts:11` `const { reapFilesOlderThan } = vi.hoisted(() => ({ reapFilesOlderThan: vi.fn(), }));`.

## Implementation steps

1. In `src/activity-log/logger.ts`, add a module-private `DAY_MS` and the async `reapActivityLogs(launchedAt, days)` export: return without reaping when the activity directory has not been set, otherwise call `reapFilesOlderThan` with that directory, `'.json'`, and `launchedAt - days * DAY_MS`. Import `reapFilesOlderThan` directly from `../state/reaper.js` with the `.js` extension. In `src/main.ts`, import `reapActivityLogs` from `./activity-log/logger.js` and add `void reapActivityLogs(Date.now(), config.logRetentionInDays).catch(() => {});` beside the three existing sweeps, unawaited and rejection-swallowed. In `src/config.ts`, widen the `logEnabled` and `logRetentionInDays` comments to include activity logs, preserving the other plans' wording if the recording plan landed first. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add `src/activity-log/reap.test.ts` as a new file, because a `vi.mock` is hoisted to the whole file and would stub the reaper under the I/O tests in `logger.test.ts`. Mock `../state/reaper.js` as the shell transcript test does. Add "reaps .json files older than the retention window" (one reaper call with the activity directory, `.json`, and `launchedAt - 7 * 86_400_000`), "uses launch as the cutoff when retention is zero" (cutoff equals `launchedAt`), and "reaps nothing before a directory has been chosen" (fresh import, no reaper call). Keep the existing shell transcript and generic reaper tests unchanged; they pin the preserved behavior. The file set sufficient for a green build is `src/activity-log/logger.ts`, `src/main.ts`, `src/config.ts`, and the new test; no spec or later subplan is needed to compile it. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This subplan changes a background launch sweep and two code comments; it adds or alters no surface the user sees or operates.

## Tests

- `src/activity-log/reap.test.ts`, new: "reaps .json files older than the retention window" (Requirement 1), "uses launch as the cutoff when retention is zero" (Requirements 2, 3), "reaps nothing before a directory has been chosen" (the uninitialized guard from Requirement 1).
- `src/shell/transcript/transcript-file.test.ts`: keep "reaps .txt files older than the retention window" passing unchanged (Preserved behavior 1).
- `src/state/reaper.test.ts`: keep "keeps files whose names do not end with the extension" passing unchanged (Preserved behavior 2); it pins the extension filter behind Requirement 6, and "leaves subdirectories and their contents untouched" plus "keeps symbolic links and their targets" pin the scope behind Requirement 7.
- Requirements 4 and 5 are the unconditional, unawaited, rejection-handled call in `src/main.ts`, which has no test file; they are confirmed in Verification. Requirement 7 also follows from the reaper being given only the activity directory, so no call can reach a sibling file.

## Out of scope

- No spec edits; the spec rename, retitle, and config/state-directory row updates are the fourth subplan.
- No change to the gate, lazy creation, or failure handling delivered by the second subplan.
- No change to the state-directory registry entry or its key, delivered by the first subplan.
- No recurring sweep while the app runs; reaping happens once per launch.
- No new retention key; `logRetentionInDays` is shared with transcripts, captures, and recordings.
- No deletion or migration of files already in `.janissary/log/` (user answer: "Leave them").

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. With Janissary stopped, backdate one activity log by ten days with `touch -t`, leave another current, drop a ten-day-old `notes.txt` beside them, and backdate `.janissary/logs/notifications.json` too. Relaunch with the default config: within a few seconds the backdated `.json` is gone while the current one, `notes.txt`, `notifications.json`, and `server.log` remain, and the UI opened without waiting. Set `"logRetentionInDays": 0` and relaunch: every activity log from earlier runs is gone and the file written after that relaunch is kept. Failure looks like a backdated `.json` surviving or any file outside `.janissary/logs/activity/` deleted.
3. Repeat the backdated-file case with `"logEnabled": false`: the old activity log is still deleted. Also run `help` after launch and confirm the sweep does not delete the file the current run just wrote. Failure looks like the old file surviving or the current file disappearing.
