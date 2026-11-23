# Move server.log into the `.janissary/logs/` directory

**Complexity: 3/10** — ~2 added lines in 2 production files, 7 requirements and 4 test scenarios (p=4.35).

## Goal

The server log sits at `.janissary/log/server.log`, beside the per-day activity-log JSON files. The issue is "move server.log to ./janissary/logs/server.log". Janissary already has a plural `.janissary/logs/` directory for the notification record, so this moves the server's own output there without touching the activity log, leaving the two kinds of log in separate directories.

## Requirements

1. "move server.log" — the launcher writes the spawned server's stdout and stderr to a file named `server.log`.
2. "to ./janissary/logs/server.log" — that file lives at `.janissary/logs/server.log` under the project directory.
3. The launcher creates the `.janissary/logs/` directory recursively before opening the log, so a launch against a fresh directory needs no prior setup.
4. No `server.log` is created at the old `.janissary/log/server.log` path.
5. The launcher still truncates the log at every launch, polls that same file for the `__JANUS_URL__` marker, and relays its tail to the terminal when the server exits before writing the marker.
6. The activity log at `.janissary/log/<YYYY-MM-DD>.json` keeps its current directory and filename pattern.
7. The specs and user-documentation pages that name the server-log path describe the new location.

## Design decisions

- Read `./janissary/logs/` as the existing plural `.janissary/logs/` directory, not a new top-level `janissary/` directory. Every project-scoped path already lives under `.janissary/`, and the earlier notification-path work deliberately created `logs/` in preference to the singular one (`product/plans/complete/notification-config-and-record-paths.md:11`).
- Change only `bin/janus.mjs`. The server never computes its own log path: the launcher opens the file and passes the descriptor as the child's stdout and stderr (`bin/janus.mjs:105-108`), so redirecting it to the new path is sufficient.
- Leave `.janissary/log/` and `TranscriptLogger` alone. The separate feature backlog item about moving activity logs into `.janissary/logs/activity/` is not part of this fix.
- Cover the move with a fast launcher test: an unknown flag makes the server report a usage error and exit 2 before any state is initialized, which is enough to assert where the launcher put the log without booting a full server.
- No command, flag, or key binding changes, so `help/commands.md`, the `help/<command>.md` pages, and `help/keys.md` need no edits.

## Preserved behavior

1. An invalid project directory is reported as a usage error with exit 2 and creates no state beside it, and specifically creates no `.janissary/logs/` directory — pinned by `scripts/janus-launcher.test.mjs` ("reports a path naming a regular file as a usage error, exits 2, and writes nothing beside it").
2. The confined browser cannot read the server log that holds the live session token, including at its new path — pinned by `src/sandbox/browser/profile.test.ts` ("denies the server log holding the live session token"), updated to the new path.
3. Per-day activity-log JSON files continue to live under `.janissary/log/`, not under the plural logs directory — pinned by `src/transcript/logger.test.ts` ("logDir returns the log directory path").

## Assumptions

1. `bin/janus.mjs:102` currently sets `const logDir = path.join(projectDir, '.janissary', 'log');`; that is the only place the launcher chooses a directory for the server log.
2. `bin/janus.mjs:108` spawns the child with `stdio: ['ignore', logFd, logFd]`, so the server writes to whichever file the launcher opened.
3. `src/transcript/logger.ts:25` sets `logDir = path.join(projectDir, '.janissary', 'log')` for the `<date>.json` activity log, a path independent of the launcher's.
4. `src/notifications/record.ts:9` already writes to `.janissary/logs/notifications.json`, so the plural directory has a precedent and no naming conflict.
5. `src/cli-args.ts:51-69` rejects unknown options in `parseCliArgs`, and `src/main.ts:108-111` exits 2 on `CliUsageError` before `initStateDirectories`, which makes the unknown-flag test fast and leaves no detached server behind.
6. The whole `.janissary/` tree is gitignored, so the relocated file needs no ignore-rule change.

## Existing functionality

1. `mkdirSync(logDir, { recursive: true })` in `bin/janus.mjs:103` already creates the log directory before the file is opened.
2. `openSync(logPath, 'w')` and `fstatSync` in `bin/janus.mjs:104-106` already truncate the log and record the starting offset for readiness polling.
3. `awaitReady` in `bin/janus.mjs:81` already polls the single log path for the URL marker and reports an early exit or timeout.
4. The `launch(...)` helper in `scripts/janus-launcher.test.mjs:14-16` already spawns the launcher with `--no-open` and a timeout.
5. `isSafeDirectory` in `src/notifications/record.ts` already creates and guards `.janissary/logs/` for the notification record.

## Implementation steps

1. In `bin/janus.mjs`, change the log directory on line 102 from the singular `.janissary/log` to the plural `.janissary/logs`; leave `openSync`, `fstatSync`, `awaitReady`, and the spawn unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `scripts/janus-launcher.test.mjs`, add a case that launches against a fresh scratch project directory with an unknown flag, asserts exit 2 and the usage message, then asserts `.janissary/logs/server.log` exists and holds that message while `.janissary/log/server.log` does not exist. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/sandbox/browser/profile.test.ts`, change the denied server-log target in the `it.each` table from `${STATE}/log/server.log` to `${STATE}/logs/server.log`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `scripts/e2e-driver.mjs`, update the `--log` example in the header comment to the new path. Build command: `$janissary/scripts/run.mjs check-diff`.
5. In `product/specs/cli.md`, replace every `.janissary/log/server.log` with `.janissary/logs/server.log` in the startup-failure, startup-sequence, and remote-server paragraphs; keep the surrounding behavior descriptions intact. Build command: `$janissary/scripts/run.mjs check-diff`.
6. In `documentation/user-documentation/getting-started/startup.md`, update the three `.janissary/log/server.log` references. In `documentation/user-documentation/getting-started/activity-log.md`, rewrite the retention paragraph so `server.log` is described as living in `.janissary/logs/` rather than beside the daily activity files, and point readers there when grepping for a failed launch. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: the server log is a file on disk with no command, flag, key binding, component, or CSS attached to it.
2. A user inspecting the project sees `server.log` inside `.janissary/logs/` alongside `notifications.json`, while the dated activity-log files remain in `.janissary/log/`.

## Tests

1. In `scripts/janus-launcher.test.mjs`, add a case asserting exit 2, the usage error in `.janissary/logs/server.log`, and no file at `.janissary/log/server.log` (Requirements 1-4).
2. Keep both existing cases in `scripts/janus-launcher.test.mjs` passing unchanged, so an invalid directory still creates nothing under the new logs directory (Preserved behavior 1).
3. Keep the denial case in `src/sandbox/browser/profile.test.ts` passing with the new path (Preserved behavior 2, Requirement 5's security context).
4. Keep `src/transcript/logger.test.ts` passing unchanged so the activity-log directory is untouched (Preserved behavior 3, Requirement 6).

## Out of scope

- No migration, copy, or removal of a `server.log` left at the old path by an earlier run.
- No move of the activity-log JSON files into `.janissary/logs/activity/`; that remains a separate feature backlog item.
- No change to the notification record's path or behavior.
- No change to the log format, truncation policy, readiness marker, or failure relaying.
- No edits to `ai/tasks/` or `ai/guidelines/` references to the old path; those are agent-workflow documents outside this fix's allowed files.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Manual checks against a real launch:

1. From a scratch project directory run `node bin/janus.mjs --no-open --bogus <scratch>`. It must exit 2, print the unknown-option usage error, and leave `<scratch>/.janissary/logs/server.log` holding that error with no `server.log` under `<scratch>/.janissary/log/`. A failure looks like the error appearing in the old path or the new file being absent.
2. Run `node bin/janus.mjs --no-open <scratch>` against a fresh directory, let it print the URL, then confirm `<scratch>/.janissary/logs/server.log` contains exactly one `__JANUS_URL__` line and the human-readable banner, while `<scratch>/.janissary/log/` holds only dated activity-log files. Stop the instance with `node bin/janus.mjs stop <scratch>`.
