# Sweep per-run server logs by age with a one-hour floor

**Complexity: 5/10** — 9 requirements, 17 test scenarios, ~30 added production lines across 2 existing files and 3 new units (p=5.52)

## Goal

Add the launch-time sweep that ages out the per-run server logs the launcher will write under `.janissary/logs/server/`. Today the launcher overwrites one shared `server.log` and no sweep looks at a server-log directory, so there is nothing to reap. This subplan delivers only the reaping mechanism and its registry wiring. It creates no server-log directory and reaps nothing until subplan 2 makes the launcher create and populate that directory. Source: `./product/plans/complete/server-log-per-run.md`, Requirements 5, 8, 14, 24, and 25. No dependency on subplans 2 or 3.

## Requirements

1. "The launch sweep deletes a server log last modified more than `logRetentionInDays` days before launch" ("reaped like transcripts"). [Source R5]
2. "Server logs are reaped by `logRetentionInDays` whatever `logEnabled` says" (user answer: "Not gated"). [Source R8]
3. "The launch sweep never deletes `latest.log`" (user answer: "latest.log symlink"). [Source R14]
4. "The launch sweep never deletes a server log last modified within the hour before launch, whatever `logRetentionInDays` says, including `0`" (user answer: "last hour"). [Source R24]
5. "The launch sweep considers only regular `.log` files directly inside `.janissary/logs/server/`, so `.janissary/logs/notifications.json`, `.janissary/logs/activity/`, and the old `.janissary/logs/server.log` are never touched" (user answer: "Leave it"; Assumptions 1 and 3). [Source R25]

## Design decisions

- Add `src/server-log/directory.ts` in the shape of `initShellTranscriptDirectory` at `src/shell/transcript/transcript-file.ts:11`: module state holds one directory, and `initServerLogDirectory(projectDirectory)` only records `path.join(projectDirectory, '.janissary', 'logs', 'server')`. It imports no filesystem module and creates nothing. The current launcher creates only the parent `logs` directory, and a missing server-log directory is already a reaper no-op (Assumptions 2, 5, and 7).
- Make `reapServerLogs(launchedAt, days)` asynchronous so `startLaunchSweeps` can attach its existing rejection handler. It returns without calling the reaper while no directory has been chosen. Otherwise it calls `reapFilesOlderThan` with the stored directory, `'.log'`, and the earlier of `launchedAt - days * DAY_MS` and `launchedAt - HOUR_MS`. Keep both constants module-private. Do not reuse `reapFilesOlderThanDays`: it has no one-hour floor (Assumptions 9 and 10).
- Match by directory and `.log` extension only. The sweep never inspects the `localhost-<stamp>` name, so naming stays in the launcher's `.mjs` module added in subplan 2. The generic reaper's regular-file check also keeps a `latest.log` symlink out of the candidate set. It does not promise to keep an aged regular `.log` target; only the symlink itself is exempt, while a target follows the same mtime cutoff as every other regular log (Assumptions 3, 4, and 6).
- Register the directory as `serverLog` immediately after `shellTranscript` and before `browserLog` in `src/state/dirs.ts`, with no `clear` and a "No `clear`, deliberately" comment naming `reapServerLogs` as the remover. Mirror the `shellTranscript` entry at `src/state/dirs.ts:47`–`:53`, and add `'serverLog'` to `KNOWN_STATE_DIRECTORY_KEYS` in the same position so the completeness check at `src/state/dirs.ts:121` stays balanced (Assumptions 13 and 14).
- Append `reapServerLogs` after `reapActivityLogs` in `SWEEPS` at `src/launch-sweeps.ts:7`. It then runs once per launch, unawaited, with the existing per-entry rejection swallowing at `src/launch-sweeps.ts:10`. `src/main.ts:80` already calls `startLaunchSweeps(Date.now(), config.logRetentionInDays)`, so it needs no edit and never passes `logEnabled` (Assumption 11).
- Requirement 5 limits what this sweep touches; it does not change the current launcher. Until subplan 2 lands, `bin/janus.mjs` still truncates the old `.janissary/logs/server.log`. Do not move that launcher change into this subplan (Assumption 1).

## Preserved behavior

1. Every existing registry entry with a `clear` still runs that clear once per launch. Adding `serverLog` must not add a `clear`, remove an existing clear, or weaken the existing clear assertions. Test: `src/state/dirs.test.ts:110` `it('clears every entry with a clear on every launch'`.
2. Every existing launch sweep still starts once with the same `launchedAt` and `days`. The server-log addition must not drop, duplicate, or retarget an existing sweep. Test: `src/launch-sweeps.test.ts:28` `it('starts every sweep once with the launch time and retention days'`.
3. `startLaunchSweeps` still returns without waiting for any sweep. The server-log addition must not be awaited. Test: `src/launch-sweeps.test.ts:36` `it('returns without waiting for a sweep to finish'`.
4. A rejected sweep still leaves the other sweeps running. The server-log sweep must use the same per-entry rejection handling rather than delaying startup or escaping as an unhandled rejection. Test: `src/launch-sweeps.test.ts:42` `it('swallows a sweep that rejects without stopping the others'`.

## Assumptions

1. The current launcher truncates one shared log at `.janissary/logs/server.log`: `bin/janus.mjs:104` `const logPath = path.join(logDir, 'server.log');` and `bin/janus.mjs:105` `const logFd = openSync(logPath, 'w');`.
2. The current launcher's recursive directory creation stops at `.janissary/logs`, not `.janissary/logs/server`: `bin/janus.mjs:102` `const logDir = path.join(projectDir, '.janissary', 'logs');` and `bin/janus.mjs:103` `mkdirSync(logDir, { recursive: true });`.
3. The reaper considers only direct, regular files whose case-sensitive names end with the requested extension: `src/state/reaper.ts:10` `entries = await readdir(directory, { withFileTypes: true });` and `src/state/reaper.ts:16` `if (!entry.isFile() || !entry.name.endsWith(extension)) continue;`.
4. The reaper deletes a candidate only when its mtime is strictly before the cutoff: `src/state/reaper.ts:20` `if (info.mtimeMs < cutoffMs) await unlink(filePath);`.
5. A missing or unreadable directory is a no-op that creates nothing: `src/state/reaper.ts:11` `} catch {` leads to `src/state/reaper.ts:13` `return;`.
6. The existing symlink test proves that a symlink named `link.txt` survives, but its target is `target.dat`, so it does not promise that an aged regular `.log` target survives: `src/state/reaper.test.ts:71` `it('keeps symbolic links and their targets'` and `src/state/reaper.test.ts:72` `const target = makeFile('target.dat');`.
7. `initShellTranscriptDirectory` records a path without creating it: `src/shell/transcript/transcript-file.ts:11` `initShellTranscriptDirectory` and `src/shell/transcript/transcript-file.ts:12` `transcriptDirectory = path.join(projectDirectory, '.janissary', 'transcripts', 'shell');`.
8. `reapShellTranscripts` now delegates to the shared day-retention wrapper: `src/shell/transcript/transcript-file.ts:24` `reapShellTranscripts` and `src/shell/transcript/transcript-file.ts:25` `await reapFilesOlderThanDays(transcriptDirectory, '.txt', launchedAt, days);`.
9. `reapFilesOlderThanDays` computes only `launchedAt - days * DAY_MS`, with no per-directory floor: `src/state/retention.ts:5` `reapFilesOlderThanDays` and `src/state/retention.ts:7` `await reapFilesOlderThan(directory, extension, launchedAt - days * DAY_MS);`.
10. `logRetentionInDays` already accepts `0`: `src/config-decode.ts:28` `nonNegativeIntegerValue` and `src/config-decode.ts:29` `return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;`.
11. `SWEEPS` is the single launch-sweep list, and its runner starts every entry with the same arguments without awaiting and swallows each rejection: `src/launch-sweeps.ts:7` `const SWEEPS = [...]` and `src/launch-sweeps.ts:10` `for (const sweep of SWEEPS) void sweep(launchedAt, days).catch(() => {});`.
12. The launch-sweep test derives `allSweeps` from its hoisted mock object, so a new hoisted mock is included in the existing assertions: `src/launch-sweeps.test.ts:4` `const sweeps = vi.hoisted(() => ({` and `src/launch-sweeps.test.ts:17` `const allSweeps = Object.values(sweeps);`.
13. The registry's entry list and known-key list are checked for completeness in both directions: `src/state/dirs.ts:107` `] as const satisfies readonly StateDirectoryEntry[];`, `src/state/dirs.ts:112` `KNOWN_STATE_DIRECTORY_KEYS`, and `src/state/dirs.ts:121` `STATE_DIRECTORY_ORDER_IS_COMPLETE`.
14. The registry test currently pins fourteen entries: `src/state/dirs.test.ts:101` `expect(STATE_DIRECTORY_ENTRIES).toHaveLength(14);`.
15. The sessions-store registry test only looks up `remoteSessions`, so the new entry needs no edit there: `src/sessions/store.test.ts:228` `const entries: readonly { name: string; clear?: () => void }[] = STATE_DIRECTORY_ENTRIES;` and `src/sessions/store.test.ts:229` `const entry = entries.find((candidate) => candidate.name === 'remoteSessions');`.
16. The schedule storage integration test calls `clearStateDirectories` and relies on entries without a clear surviving, so a no-clear `serverLog` entry needs no edit: `src/schedule/system/storage.integration.test.ts:185` `clearStateDirectories();`.

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files, `reapFilesOlderThan` in `src/state/reaper.ts:7`.
2. The missing-directory no-op, pinned by "resolves for a directory that does not exist" in `src/state/reaper.test.ts:81`.
3. The init-records-a-directory-without-creating-it shape, `initShellTranscriptDirectory` in `src/shell/transcript/transcript-file.ts:11`.
4. The asynchronous retention-wrapper shape, `reapShellTranscripts` in `src/shell/transcript/transcript-file.ts:24`, delegating to `reapFilesOlderThanDays` in `src/state/retention.ts:5`.
5. The launch sweep list, `SWEEPS` in `src/launch-sweeps.ts:7`.
6. The state-directory registry with deliberately uncleared entries, `STATE_DIRECTORY_ENTRIES` in `src/state/dirs.ts:25`.
7. The "never clears" test to copy, "never clears the shell transcript directory" in `src/state/dirs.test.ts:137`.
8. The mocked-reaper pattern for wrapper tests, `vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));` in `src/shell/transcript/transcript-file.test.ts:16`.
9. The fresh-module pattern for testing uninitialized module state, `vi.resetModules()` in `src/shell/transcript/transcript-file.test.ts:68`.
10. The hoisted-sweeps test pattern in `src/launch-sweeps.test.ts:4`.
11. The symlink-preservation test in `src/state/reaper.test.ts:71` "keeps symbolic links and their targets".

## Implementation steps

The steps land in order, each leaving the tree green. This subplan can land before or after subplans 2 and 3: before them, the missing directory is a no-op; after them, the same sweep handles the files they create. The new module stays small, and `src/state/dirs.ts` and `src/launch-sweeps.ts` remain well below the 200-line limit, so no extraction is needed. Use direct relative imports with `.js` extensions.

1. **Add the server-log directory module and its test.** Create `src/server-log/directory.ts` with imports only from `node:path` and `../state/reaper.js`. Keep one module-level directory string. `initServerLogDirectory(projectDirectory)` stores the `.janissary/logs/server` path and performs no filesystem operation. `reapServerLogs(launchedAt, days)` is asynchronous, returns without reaping while the string is empty, and otherwise delegates to `reapFilesOlderThan` with `'.log'` and the minimum of the retention cutoff and one hour before launch. Keep `DAY_MS` and `HOUR_MS` private. Use a header comment only to explain why the one-hour floor exists and why initialization does not create the directory. Add `src/server-log/directory.test.ts`, mocking `../state/reaper.js` as `src/shell/transcript/transcript-file.test.ts:16` does. Cover a seven-day call with the server directory, `'.log'`, and `launchedAt - 7 * 86_400_000` (Requirements 1 and 5); `days` `0` with `launchedAt - 3_600_000` (Requirement 4); and no chosen directory with no reaper call (Requirement 1). For the last case, call `vi.resetModules()` and dynamically import a fresh `./directory.js`, as `src/shell/transcript/transcript-file.test.ts:68` does, because earlier cases initialize module state. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Wire the directory into the state registry.** In `src/state/dirs.ts`, import `initServerLogDirectory` from `../server-log/directory.js`, insert a `serverLog` entry directly after `shellTranscript` and before `browserLog`, omit `clear`, and add the existing "No `clear`, deliberately" comment style naming `reapServerLogs` as the remover. Add `'serverLog'` to `KNOWN_STATE_DIRECTORY_KEYS` at the same position. In `src/state/dirs.test.ts`, add a hoisted `initServerLogDirectory` mock and its module mock, assert the call in "inits every registered subsystem in registry order", raise the length assertion from 14 to 15, and add "never clears the server log directory" copied from the `shellTranscript` case. Leave the existing `clearStateDirectories` assertions unchanged (Requirement 1; Preserved behavior 1). Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Register the sweep with the launch sweeps and pin it.** In `src/launch-sweeps.ts`, import `reapServerLogs` from `./server-log/directory.js` and append it to `SWEEPS` after `reapActivityLogs`. In `src/launch-sweeps.test.ts`, add a hoisted `reapServerLogs` mock and its module mock so `allSweeps` includes it. Keep the three existing cases and add a case that makes only `reapServerLogs` reject, awaits `settle()`, and confirms every sweep was started without an unhandled rejection (Requirements 1 and 2; Preserved behavior 2–4). Do not edit `src/main.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: the sweep runs in the background over an internal log directory and adds no command, flag, key binding, CSS, or component.
2. The observable effect is on disk: aged regular `.log` files directly in `.janissary/logs/server/` disappear, a regular `.log` modified within the one-hour floor remains, and a `latest.log` symlink remains even when the link itself is old. An aged regular `.log` target is not exempt. Non-`.log` files, subdirectories, and files outside the server-log directory remain unchanged (Requirements 1, 3, 4, and 5).

## Tests

- `src/server-log/directory.test.ts`: "reaps .log files older than the retention window" (Requirements 1 and 5), "never reaps a log modified within the last hour when retention is zero" (Requirement 4), and "reaps nothing before a directory has been chosen" (Requirement 1).
- `src/state/dirs.test.ts`: the new `initServerLogDirectory` expectation in "inits every registered subsystem in registry order" (Requirement 1), the new "never clears the server log directory" case (Preserved behavior 1), and the updated length assertion (Assumption 14).
- `src/launch-sweeps.test.ts`: the three existing cases now also cover `reapServerLogs` through `allSweeps` (Requirements 1 and 2; Preserved behavior 2–4), plus the new server-log rejection case (Preserved behavior 4).
- `src/state/reaper.test.ts`: no edit. "deletes a file whose mtime is before the cutoff" and "keeps files whose mtime is at or after the cutoff" pin Requirement 1; "keeps symbolic links and their targets" pins Requirement 3; "leaves subdirectories and their contents untouched" and "keeps files whose names do not end with the extension" pin Requirement 5; "resolves for a directory that does not exist" pins the no-directory behavior in Design decisions.

## Out of scope

- No log files are created or named in this subplan; the launcher adds those in subplan 2, and the name shape stays out of the TypeScript tree.
- No change to the old shared `server.log` while subplan 2 is absent; this plan only keeps it outside the sweep.
- No periodic sweep while the app runs. Reaping happens once per launch.
- No change to `logEnabled` handling, config decoding, `src/main.ts`, the launcher, playbooks, or specs.
- No migration of the old single `server.log`.
- No user or developer documentation changes; playbooks and specs belong to subplans 4 and 5.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. `npm run build`
3. Create a scratch project and write `<scratch>/.janissary/config.json` containing `{"logEnabled": false, "logRetentionInDays": 0}`. Create `<scratch>/.janissary/logs/server/nested` and `<scratch>/.janissary/logs/activity`. In the server directory create `old.log`, a recently modified `current.log`, `notes.txt`, and `nested/old.log`; create `latest.log` as a symlink to `current.log`. In the parent `logs` directory create `notifications.json` and the old `server.log`, and in `logs/activity` create `keep.txt`. Backdate every fixture except `current.log` with `touch -t 202001010000`, and backdate the symlink itself with `touch -h -t 202001010000`. Record the contents or checksums of `current.log`, `notes.txt`, `nested/old.log`, `notifications.json`, `logs/activity/keep.txt`, and `logs/server.log`. Run `node dist/main.js --no-open <scratch>` directly in one terminal, wait for its `__JANUS_URL__` line and a few seconds for the background sweep, then inspect the fixtures from another terminal. `old.log` must be gone; `current.log`, the `latest.log` symlink, `notes.txt`, `nested/old.log`, `notifications.json`, `logs/activity/keep.txt`, and `logs/server.log` must remain, and the recorded contents or checksums must match. Running the server directly is required because the pre-subplan-2 launcher would truncate `logs/server.log` before the sweep runs. Stop it with `node bin/janus.mjs stop <scratch>`. Failure looks like `old.log` surviving despite `logEnabled: false`, `current.log` or the symlink disappearing, a nested or non-`.log` file changing, an outside file changing, or startup waiting for the sweep.
