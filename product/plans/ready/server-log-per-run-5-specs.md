# Update the server-log specs for per-run logs and the latest.log link

**Complexity: 2/10** — 19 requirements and 1 preserved-path scenario, no production code (p=3.95)

## Goal

Bring `product/specs/` in line with the per-run local server logs specified by subplans 1–3. The specs currently describe one truncated `server.log` shared by every launch. Once those subplans land, the specs should describe a new `localhost-<stamp>.log` per launch, a `latest.log` symlink repointed once the new server is ready, the warning line when that link cannot be updated, and age-based reaping with a one-hour floor. Source: `./product/plans/complete/server-log-per-run.md`; `Source R#` below refers to its numbered requirements. Depends on `./product/plans/ready/server-log-per-run-1-server-log-sweep.md`, `./product/plans/ready/server-log-per-run-2-per-run-launch-log.md`, and `./product/plans/ready/server-log-per-run-3-latest-log-symlink.md`.

## Requirements

1. The CLI spec states that each detached local launch with a valid project directory writes its output to a new `.janissary/logs/server/localhost-<stamp>.log`, where `<stamp>` is the UTC ISO launch time with `:` and `.` replaced by `-`, for example `localhost-2026-11-23T15-04-05-123Z.log` ("Each local run writes its server output to a new file under `.janissary/logs/server/`"; "A server log's name is the host name followed by the UTC ISO launch time"). [Source R1, R4]
2. The CLI spec states that a same-millisecond filename collision advances the timestamp by one millisecond instead of replacing an existing run's log ("update server.log to be created for each run"). [Source R1; subplan 2 R13]
3. The CLI spec states that an existing `.janissary/logs/server.log` is never written, moved, or reaped ("An existing `.janissary/logs/server.log` is never written, moved, or reaped"). [Source R6]
4. The CLI spec states that a failed detached launch in a valid project directory, including an instance-lock refusal or child usage error, retains its own per-run log ("A launch that fails, including one refused by the instance lock or a usage error, keeps its own log"). [Source R9]
5. The CLI spec states that a launch whose server exits before readiness relays the tail of that run's own log to the terminal ("A failed launch's log tail is still relayed to the terminal"). [Source R10, R18]
6. The CLI spec states that a server exiting before readiness preserves the server's own exit code ("the launcher exits with the server's own exit code"). [Source R18]
7. The CLI spec states that readiness comes only from a `__JANUS_URL__` line in the new run's own log ("The launcher takes readiness only from a `__JANUS_URL__` line in the new run's own log, never from a line in another run's log"). [Source R17]
8. The CLI spec states that `.janissary/logs/server/latest.log` is a symbolic link to the current run's server log ("`.janissary/logs/server/latest.log` is a symbolic link to the current run's server log"). [Source R12]
9. The CLI spec states that `latest.log` is repointed only after the new server's `__JANUS_URL__` line appears ("`latest.log` is repointed only after the new server's `__JANUS_URL__` line appears"). [Source R15]
10. The CLI spec states that a launch failing or refused before readiness leaves `latest.log` targeting its previous run ("A launch that fails or is refused before readiness leaves `latest.log` pointing where it pointed before"). [Source R16]
11. The CLI spec gives the exact one-line stderr warning `warning: could not update <project-dir>/.janissary/logs/server/latest.log: <reason>`, with an absolute `<project-dir>` and with `<reason>` equal to the error's message or exactly `not a symbolic link` for a regular file or directory ("the launcher prints exactly one line to stderr"). [Source R22]
12. The CLI spec states that a `latest.log` update failure does not fail the launch ("When `latest.log` cannot be updated, the launch still succeeds"). [Source R21]
13. The CLI spec states that a `latest.log` update failure leaves the existing file, directory, or link as it was ("When `latest.log` cannot be updated, it is left as it was"). [Source R23]
14. The CLI, config, and state-directory specs state that the server-log cutoff is the earlier of launch minus `logRetentionInDays` days and launch minus one hour, with files at or after that cutoff retained even when the setting is `0` ("The launch sweep deletes a server log last modified more than `logRetentionInDays` days before launch"; "never deletes a server log last modified within the hour before launch ... including `0`"). [Source R5, R24]
15. The CLI, config, and state-directory specs state that the server-log sweep considers only regular `.log` files directly inside `.janissary/logs/server/` and never deletes the `latest.log` symlink ("considers only regular `.log` files directly inside"; "never deletes `latest.log`"). [Source R14, R25]
16. The CLI and config specs state that server logs are written whether `logEnabled` is true or false ("Server logs are written whether `logEnabled` is true or false"). [Source R7]
17. The CLI and config specs state that server logs are reaped whether `logEnabled` is true or false ("Server logs are reaped by `logRetentionInDays` whatever `logEnabled` says"). [Source R8]
18. The CLI spec states that a successful `--no-open` launch prints the new server's URL alone on stdout ("Under `--no-open`, the launcher still prints the new server's URL on its own line to stdout"). [Source R19]

## Design decisions

- Treat `product/specs/` as the behavioral source of truth: name the observable file, link, warning, and retention rules rather than the implementation modules. Quote the warning verbatim and use `[[name]]` for new spec cross-references, following `ai/guidelines/developer-documentation.md:16` and `:23` (Assumptions 1–10; Existing functionality 6–8).
- Edit the existing CLI sections in place. Update the startup-directory list at `product/specs/cli.md:57` and the launch-sweep list at `product/specs/cli.md:60` as well as the server-log paragraphs; both currently omit server logs (Assumptions 3–4).
- Distinguish the launcher's per-run output and readiness file from the stable `latest.log` read path. The link holds the bare per-run file name, not an absolute path, and moves only after readiness (Assumptions 5–7, 11–12).
- State the retention rule as a minimum cutoff, not as "`0` deletes every earlier log": server logs use `min(launch minus retention days, launch minus one hour)`. Only direct regular `.log` files are candidates, so the symlink, subdirectories, other extensions, and files outside the directory are outside the sweep (Assumptions 4, 8, 10).
- Use the old `.janissary/logs/server.log` path only in the explicit statement that the legacy file is never written, moved, or reaped. The `remote-serve` section instead says it writes no per-run server log (Assumptions 2, 6–7).
- Land this subplan only after subplans 1–3. The source plan's `complete/` path is intentional: the source moves there unchanged as the decomposition's final step (Assumptions 12–13).

## Preserved behavior

1. A missing project directory still runs the server attached, exits 2 with the usage error, and creates no `.janissary/` tree at that path. Negative assertion: no server-log directory is created at or above the missing path before the usage error. Existing pin: `scripts/janus-launcher.test.mjs:36` "reports a path that does not exist as a usage error, exits 2, and does not create it".

## Assumptions

1. The startup-failure passage names the old shared log and terminal as the banner destinations: `product/specs/cli.md:42` "is written to both `.janissary/logs/server.log` and the terminal".
2. The startup-sequence passage names the old shared log as the detached server's output destination: `product/specs/cli.md:52` "redirecting all of its output to `.janissary/logs/server.log`".
3. The startup-directory list omits a server-log directory: `product/specs/cli.md:57` "the harness capture, recording, and harness and shell transcript directories that are kept across launches".
4. The startup-sweep list omits server logs: `product/specs/cli.md:60` "deletes captures, recordings, and transcripts older than `logRetentionInDays` days".
5. The readiness paragraph names the old shared log as the launcher's input: `product/specs/cli.md:66` "The launcher watches `.janissary/logs/server.log`".
6. The persistence paragraph says the old shared log is truncated every launch: `product/specs/cli.md:68` "is truncated at the start of every launch".
7. The remote-server passage denies writing the old shared log: `product/specs/cli.md:99` "no `.janissary/logs/server.log`".
8. The retention row's extension list has no `.log` entry: `product/specs/application-config.md:16` "`.txt` files for transcripts and captures, `.cast` files for recordings, and `.json` files for activity logs".
9. The `logEnabled` row lists transcripts, recordings, and activity logs but not server logs: `product/specs/application-config.md:15` "Whether harness and shell session transcript files".
10. The state-directory sentence lists retained artifacts but not server logs: `product/specs/state-directory.md:5` "Recordings under `.janissary/recordings/`".
11. The current launcher still opens the old fixed path, so the future behavior is not yet present in this checkout: `bin/janus.mjs:104` "const logPath = path.join(logDir, 'server.log');".
12. The link subplan requires the per-run-log subplan: `product/plans/ready/server-log-per-run-3-latest-log-symlink.md:7` "Depends on `./product/plans/ready/server-log-per-run-2-per-run-launch-log.md`".
13. The source plan already assigns the spec edits to its final step: `product/plans/ready/server-log-per-run.md:87` "**Specs.**".

## Existing functionality

1. The CLI startup-failure section to edit in place: `product/specs/cli.md:40` "### Startup failures".
2. The CLI startup-sequence section to edit in place: `product/specs/cli.md:50` "### Startup sequence".
3. The CLI remote-server section to edit in place: `product/specs/cli.md:93` "### Serving a remote janissary".
4. The application settings table whose two log rows need edits: `product/specs/application-config.md:7` "| Setting | Type | Default | Description |".
5. The state-directory lifecycle sentence to edit in place: `product/specs/state-directory.md:5` "are kept across launches and swept by age at launch instead".
6. The spec cross-reference convention: `ai/guidelines/developer-documentation.md:16` "Cross-reference with `[[name]]`".
7. The verbatim-message rule: `ai/guidelines/developer-documentation.md:23` "State the exact error and usage messages".
8. The rule that behavior and its spec move together: `ai/guidelines/architecture-principles.md:77` "A behavior change updates its `product/specs/` file in the same change".

## Implementation steps

1. **Rewrite the CLI server-log passages.** In `product/specs/cli.md`, update the startup-failure paragraph at `:42`, the detached-launch paragraph at `:52`, the directory list at `:57`, the sweep list at `:60`, the readiness paragraph at `:66`, the log-persistence paragraph at `:68`, and the remote-server sentence at `:99`. State the exact per-run name and directory, collision behavior, legacy-file exclusion, failed-launch log retention, own-log readiness scan, tail relay, child exit code, and `--no-open` stdout URL from Requirements 1–7 and 18. State the invalid-project attached exception from Preserved behavior 1. The readiness paragraph also spells out the 20-second timeout, process-group kill, exact `failed to start: timed out waiting for the server` stderr line, and exit 1. The persistence paragraph names the URL banner, human-readable banner, non-fatal warnings, and failed-to-start banner as the log's contents. Describe `latest.log` as a relative symlink holding the bare per-run file name, repointed only after readiness; a pre-readiness failure does not move it. Give the exact warning from Requirement 11, and state that a blocked link neither fails the launch nor changes the existing entry. Add the server-log directory to the initialized-directory list. Add server logs to the background-sweep list, with the one-hour floor and direct-regular-`.log` scope. Add `[[application-config]]` and `[[state-directory]]` links where the settings or lifecycle are described. In the remote-server section, say `remote-serve` writes no per-run server log. Build command and green check: `$janissary/scripts/run.mjs check-diff`.
2. **Update the application-config rows.** In `product/specs/application-config.md:16`, add server logs under `.janissary/logs/server/` to `logRetentionInDays`, add `.log` to the direct regular-file extension list, and state the earlier-of cutoff with the one-hour floor. Qualify the existing "`0` keeping none from earlier runs" sentence so it applies to the other retained artifacts, not to server logs modified within the floor. In `product/specs/application-config.md:15`, state that `logEnabled` governs neither server-log writing nor server-log reaping. Build command and green check: `$janissary/scripts/run.mjs check-diff`.
3. **Update the state-directory lifecycle sentence.** In `product/specs/state-directory.md:5`, add server logs under `.janissary/logs/server/` to the artifacts kept across launches and swept by age at launch. Name direct regular `.log` files, the earlier-of `logRetentionInDays` and one-hour cutoff, and the `latest.log` symlink exemption, with a `[[cli]]` link for the per-run naming and readiness behavior. Build command and green check: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No application or terminal interface changes: this subplan edits behavior specs only, with no component, CSS, key binding, flag, or command involved.
2. The developer-facing spec surfaces changed are the CLI startup-failure, startup-sequence, and remote-server sections, the two application-config log rows, and the state-directory lifecycle sentence.

## Tests

No application tests are introduced or edited. This subplan changes no application behavior and adds no code; tests of documentation are not introduced. Verification is the reading-based check below.

## Out of scope

- No source, test, config, launcher, sweep, symlink, playbook, driver, help-page, or public documentation changes.
- No new configuration key and no change to `logRetentionInDays` or `logEnabled` types, defaults, or validation.
- No change to the retention policy itself; this subplan records the policy delivered by subplan 1.
- No migration, deletion, or rewriting of the legacy `.janissary/logs/server.log`.
- No remote server logs: `janus remote-serve` stays attached and writes no per-run server log.
- No promotion of this plan and no move of the source plan; the source's final move to `complete/` belongs to the decomposition workflow.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Read `product/specs/cli.md`, `product/specs/application-config.md`, and `product/specs/state-directory.md`. Search them for `.janissary/logs/server.log`, `.janissary/log/server.log`, and `truncated`. The only permitted old-path occurrence is the explicit statement that `.janissary/logs/server.log` is never written, moved, or reaped; no active launch, readiness, or remote-server sentence may use it. Confirm the exact per-run filename and collision rule, own-log readiness scan, relative `latest.log` target, readiness-before-link ordering, failed-launch log retention, tail relay, child exit code, prior-link preservation before readiness, blocked-link preservation, exact warning, `logEnabled` independence, and `--no-open` URL output. Confirm the invalid-project attached exception from Preserved behavior 1 and the statement that `remote-serve` writes no per-run server log. Confirm the CLI directory and sweep lists include server logs. Confirm the CLI sweep paragraph, the `logRetentionInDays` row, and the state-directory sentence state the earlier-of cutoff, the one-hour floor at `0`, direct regular `.log` candidates, and the symlink exemption. A surviving "truncated at the start of every launch" claim, an old path used as an active log, a missing floor, or a retention row that still says `0` removes every earlier server log shows the change was not made correctly. No running-app check is required because this subplan adds no code and changes no application behavior.
