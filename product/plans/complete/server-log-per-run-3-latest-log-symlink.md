# Repoint a latest.log symlink only after the new server is ready

**Complexity: 5/10** — 7 requirements, 12 scenarios, ~40 added production lines (p=5.28)

## Goal

Give the per-run server logs a stable read path: `.janissary/logs/server/latest.log` is a symbolic link to the current run's log, repointed only once the new server's own `__JANUS_URL__` line has appeared. A failed or refused launch must leave the link where it was, and a link that cannot be updated produces one warning line while the launch still succeeds. Source: `./product/plans/complete/server-log-per-run.md`. Depends on `./product/plans/ready/server-log-per-run-2-per-run-launch-log.md`, which creates `bin/server-log.mjs` and makes the launcher write a per-run log; this subplan adds to both.

## Requirements

1. "`.janissary/logs/server/latest.log` is a symbolic link to the current run's server log" (user answer: "latest.log symlink"). [Source R12]
2. "`latest.log` is repointed only after the new server's `__JANUS_URL__` line appears" (user answer: "Once ready"). [Source R15]
3. "A launch that fails or is refused before readiness leaves `latest.log` pointing where it pointed before" (user answer: "Once ready"). [Source R16]
4. "The launcher replaces `latest.log` only when it is a symbolic link or absent, never when it is a regular file or a directory" (user answer: "Warn, keep running"). [Source R20]
5. "When `latest.log` cannot be updated, the launch still succeeds" (user answer: "Warn, keep running"). [Source R21]
6. "When `latest.log` cannot be updated, the launcher prints exactly one line to stderr: `warning: could not update <project-dir>/.janissary/logs/server/latest.log: <reason>`, with the absolute path and, as `<reason>`, the error's message, or exactly `not a symbolic link` when a regular file or directory holds the name" (user answers: "Warn, keep running", "Could not update", "not a symbolic link"). [Source R22]
7. "When `latest.log` cannot be updated, it is left as it was" (user answer: "Warn, keep running"). [Source R23]

## Design decisions

- Add `pointLatestLog(logDir, fileName)` as a second export of `bin/server-log.mjs`, beside `serverLogFilename`. It returns `undefined` on success and the reason as a string on failure, so the launcher prints the warning without a second error-handling path.
- Inspect `latest.log` with `lstatSync`. Only `ENOENT` means the name is absent. An existing non-link returns exactly `not a symbolic link` without changing anything, covering both a regular file and a directory. Any other `lstatSync` error returns its `message` without changing anything.
- Name the temporary link `${latestPath}.${randomUUID()}.tmp`, using `randomUUID` from `node:crypto` and following `atomicWriteFile` at `src/atomic-write.ts:9`. The unique suffix prevents a stale temporary name from blocking a later launch, and the `.tmp` suffix keeps the temporary link out of the server-log sweep.
- Create the temporary symbolic link with the bare `fileName`, then rename it over `latest.log`. Never unlink `latest.log` first: the rename replaces an existing link atomically, and a failed symlink creation or rename leaves the old name untouched. On either failure, remove the temporary link with best-effort `rmSync`, ignore a cleanup failure, and return the original error's `message`.
- Keep the link target relative to `logDir` rather than absolute, so the link still resolves if the project directory is moved or mounted elsewhere.
- In `bin/janus.mjs`, call `pointLatestLog(logDir, path.basename(logPath))` after `child.unref()` and before the `--no-open` URL print. This is one insertion between two anchored statements and places the link update after readiness (Requirement 2).
- On a returned reason, write one stderr line using `path.join(logDir, 'latest.log')` as the absolute path, then continue to the URL print and `process.exit(0)` (Requirements 5 and 6; Preserved behavior 1). Do not catch around `pointLatestLog`; its contract already converts filesystem failures to reasons.
- Keep both pre-readiness branches free of link work. The child-exit and timeout paths in the existing catch block never call the helper (Requirement 3).
- Leave the launch sweep unchanged. Its regular-file check already excludes the new symlink, so no reaper or retention edit belongs here.

## Preserved behavior

1. A successful `--no-open` launch still writes exactly the new server's URL plus a newline to stdout and exits 0. Negative assertion: link updates and link warnings add no stdout and do not change the exit status. Existing pin: `scripts/janus-launcher-per-run.test.mjs` "uses its own readiness marker after a filename collision and prints it under --no-open" (`product/plans/ready/server-log-per-run-2-per-run-launch-log.md:72`); Implementation step 2 replaces its old no-link assertion with the new expected link while retaining its URL and exit assertions.
2. A child that exits before readiness still has its own log tail relayed to stderr and its exit code preserved. Negative assertion: that path neither repoints `latest.log` nor prints a link warning. Existing pin after required subplan 2: `scripts/janus-launcher-per-run.test.mjs` "relays only its own pre-readiness failure and preserves the child exit code" (`product/plans/ready/server-log-per-run-2-per-run-launch-log.md:72`).
3. A missing project directory still runs the server attached, exits 2, and creates no directory at that path. Negative assertion: no `.janissary/` tree is created before the usage error. Existing pin: `scripts/janus-launcher.test.mjs:36` "reports a path that does not exist as a usage error, exits 2, and does not create it".
4. The launch sweep still ignores symbolic links. Negative assertion: an aged `latest.log` link is never unlinked by the sweep. Existing pin: `src/state/reaper.test.ts:71` "keeps symbolic links and their targets".

## Assumptions

1. `bin/janus.mjs:81` `function awaitReady(logPath, offset, child)` resolves at `bin/janus.mjs:89` only after `readLogSince` finds a line starting with `URL_MARKER`; required subplan 2 keeps this scan and supplies offset `0` for the new run's own log.
2. `bin/janus.mjs:112` `child.unref();` is immediately followed by the `--no-open` URL print at `bin/janus.mjs:113` and `process.exit(0)` at `bin/janus.mjs:114`.
3. `bin/janus.mjs:115` `} catch (error) {` handles both the child-exit branch at `bin/janus.mjs:116` and the timeout branch at `bin/janus.mjs:120`; the current block contains no link work.
4. `bin/janus.mjs:59` `return path.resolve(arg);` and `bin/janus.mjs:61` `return process.cwd();` make `projectDir` absolute, so the `logDir` derived from it and the warning path are absolute.
5. `src/state/reaper.ts:16` `if (!entry.isFile() || !entry.name.endsWith(extension)) continue;` excludes symbolic links from sweep candidates.
6. `src/state/reaper.test.ts:71` `it('keeps symbolic links and their targets'` pins the regular-file-only sweep behavior.
7. `scripts/e2e/session.mjs:44` `export function readAppUrl(serverLogPath)` reads whatever file path its caller supplies, so a symlink path needs no reader change.
8. `scripts/janus-launcher.test.mjs:56` `const result = launch('--bogus', scratch);` exercises a real launcher child that exits before readiness, which is suitable for the failed-launch link-preservation test.

## Existing functionality

1. The per-run log helper and its scratch-directory test, delivered by required subplan 2: `product/plans/ready/server-log-per-run-2-per-run-launch-log.md:70` `serverLogFilename(timestamp)` in `bin/server-log.mjs`, tested by `scripts/server-log.test.mjs`.
2. The isolated launcher fixture that starts a fake server without a built web bundle, delivered by required subplan 2: `product/plans/ready/server-log-per-run-2-per-run-launch-log.md:72` `scripts/janus-launcher-per-run.test.mjs` with `JANUS_LAUNCHER_FIXTURE_MODE` and `JANUS_LAUNCHER_FIXTURE_PID_FILE`.
3. The atomic temporary-file-plus-rename pattern, including unique naming and best-effort cleanup: `src/atomic-write.ts:8` `atomicWriteFile`, `src/atomic-write.ts:9` ``const temporary = `${file}.${randomUUID()}.tmp`;``, `src/atomic-write.ts:15` `renameSync(temporary, file);`, and `src/atomic-write.ts:17` `try { rmSync(temporary, { force: true }); }`.
4. The generic regular-file-only reaper: `src/state/reaper.ts:7` `reapFilesOlderThan` and its candidate check at `src/state/reaper.ts:16`.
5. The symlink-preservation pin: `src/state/reaper.test.ts:71` "keeps symbolic links and their targets".
6. The log-as-address reader that needs no code change: `scripts/e2e/session.mjs:44` `readAppUrl`.
7. The launcher failure-test helper: `scripts/janus-launcher.test.mjs:14` `function launch(...args)` and its `launch('--bogus', scratch)` call at `scripts/janus-launcher.test.mjs:56`.

## Implementation steps

Land this subplan only after subplan 2, which supplies the module and isolated launcher tests extended below. Subplan 1 may land before or after this work because the current reaper already skips symbolic links. The steps land in order, each leaving the tree green. `bin/janus.mjs` remains below the 200-line limit, `bin/server-log.mjs` remains a small launcher helper, and no source extraction is needed.

1. **Add the link helper and its unit tests.** Extend `bin/server-log.mjs` with `pointLatestLog(logDir, fileName)` as described in Design decisions: `lstatSync` with `ENOENT` as the only absent-name case, an exact `not a symbolic link` refusal for existing non-links, a UUID-suffixed temporary symlink holding the bare file name, atomic rename, best-effort temporary cleanup, and returned error messages. Extend `scripts/server-log.test.mjs` with a scratch directory and cover: an absent `latest.log` whose target is the bare file name and whose content is the new log; replacement of an existing link; replacement of a dangling link; refusal of a regular file without changing its bytes; refusal of a directory without changing its contents; an `lstatSync` error other than `ENOENT`; a thrown symlink-creation error; and a thrown rename error. Seed an existing link for each error case and assert the returned message and unchanged link target; the symlink and rename cases also assert no temporary link remains. Follow the partial `node:fs` mock and forced rename failure in `src/atomic-write.test.ts:8` and `src/atomic-write.test.ts:55`. Build command and green check: `$janissary/scripts/run.mjs check-diff`.
2. **Repoint only after readiness and warn without failing.** In `bin/janus.mjs`, import `pointLatestLog` from `./server-log.mjs`. After `child.unref()` and before the `--no-open` URL print, call it with `logDir` and `path.basename(logPath)`. On a returned reason, write exactly one stderr line in the form `warning: could not update <logDir>/latest.log: <reason>\n`, using `path.join(logDir, 'latest.log')`, then continue to the URL print and exit 0. Add no call to either catch branch. In subplan 2's existing `scripts/janus-launcher-per-run.test.mjs` case "uses its own readiness marker after a filename collision and prints it under --no-open", replace the assertion that no `latest.log` exists with an assertion that it points to the new run's bare file name; keep the exit, stdout, and seeded-file assertions. Extend that file with two cases. "keeps latest.log on the earlier run until the new server prints its readiness marker" adds a `gated-ready` fixture mode and a `JANUS_LAUNCHER_FIXTURE_GATE` path: the fake child records its pid, waits for the gate, then prints its marker; the test starts the launcher asynchronously, waits for the pid file, asserts the link still names the earlier log, opens the gate, and asserts exit 0, the new URL alone on stdout, no stderr, and a link to the new run's bare file name (Requirements 1 and 2; Preserved behavior 1). "warns once and still succeeds when latest.log is a regular file" uses the existing `ready` mode, seeds a regular file with sentinel bytes, and asserts exit 0, the URL alone on stdout, exactly the required absolute-path warning plus newline on stderr, unchanged sentinel bytes, and no temporary link (Requirements 4, 5, 6, and 7). Reuse subplan 2's detached-child teardown. Build command and green check: `$janissary/scripts/run.mjs check-diff`.
3. **Pin the failed-launch case at the launcher level.** Add "leaves an existing server.log, an earlier run's log, and latest.log alone on a failed launch" to `scripts/janus-launcher.test.mjs`: pre-seed `.janissary/logs/server.log`, an earlier `localhost-*.log`, and a `latest.log` link to that earlier file; launch with `--bogus`; assert exit 2, the usage error on stderr, all three seeded paths byte-for-byte unchanged, the link still targeting the earlier file, and a separate new failed-run log containing the usage error (Requirements 3 and 7; Preserved behavior 2). Build command and green check: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No visual interface surface changes: the link is an internal filesystem path, with no component, CSS, key binding, focus change, or tab involved.
2. The terminal success state under `--no-open` contains the new URL alone on stdout and no link warning on stderr (Preserved behavior 1).
3. The terminal blocked-link state contains exactly one warning line on stderr while the launch still exits 0 and prints the URL under `--no-open`. A launch that fails before readiness emits no link warning.

## Tests

- `scripts/server-log.test.mjs`: absent-link creation and content read-through (Requirement 1), existing-link replacement (Requirement 1), dangling-link replacement (Requirements 1 and 4), regular-file refusal (Requirements 4 and 7), directory refusal (Requirements 4 and 7), and the `lstatSync`, symlink-creation, and rename error cases (Requirements 6 and 7).
- `scripts/janus-launcher-per-run.test.mjs`: "keeps latest.log on the earlier run until the new server prints its readiness marker" (Requirements 1 and 2; Preserved behavior 1) and "warns once and still succeeds when latest.log is a regular file" (Requirements 4, 5, 6, and 7).
- `scripts/janus-launcher.test.mjs`: "leaves an existing server.log, an earlier run's log, and latest.log alone on a failed launch" (Requirements 3 and 7; Preserved behavior 2).
- `src/state/reaper.test.ts`: no edit; "keeps symbolic links and their targets" pins Preserved behavior 4.
- The real instance-lock refusal is checked end to end in Verification step 3. The usage-error test covers the same pre-readiness no-call path automatically, and the isolated fixture covers readiness ordering and the exact warning without a built web bundle.

## Out of scope

- Subplan 4 owns the playbook and e2e-driver path edits; this plan does not edit `scripts/e2e/session.mjs` or `scripts/e2e-driver.mjs`.
- No per-run log creation or naming rules; subplan 2 owns `serverLogFilename` and the launcher's log setup.
- No reaper, retention, or launch-sweep edits; subplan 1 owns them.
- No spec edits; subplan 5 owns them.
- No migration or deletion of an existing regular file or directory named `latest.log`; the launcher warns and leaves it in place.
- No periodic re-pointing while the app runs and no command to list or open logs.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Per-run log and link.** From a checkout with `web/dist/index.html` built, create an absolute scratch git project path holding `<scratch>/.janissary/logs/server.log` with sentinel bytes. Run `node bin/janus.mjs --no-open <scratch>`. The launcher exits 0 and prints the URL. `<scratch>/.janissary/logs/server/` holds one `localhost-<stamp>.log` whose `__JANUS_URL__` line matches the printed URL, `readlink <scratch>/.janissary/logs/server/latest.log` prints that bare file name, and the old `server.log` still holds its sentinel bytes. Failure looks like an absolute link target, a missing link, a nonzero exit, or a rewritten `server.log`.
3. **Refused second launch.** Record the first log's checksum and the link target. With that instance still running, run the same command again. It exits nonzero with `another janus instance is already running in this directory…` relayed from a second `localhost-<stamp>.log`. `latest.log` still points at the first file, the first log's checksum is unchanged, and no link warning appears. Failure looks like the link moving, the first log changing, or a warning from a launch that never reached readiness.
4. **Next launch and retention zero.** Run `node bin/janus.mjs stop <scratch>` and wait until `<scratch>/.janissary/lock` disappears. Set `"logRetentionInDays": 0` in `<scratch>/.janissary/config.json`, backdate every existing `<scratch>/.janissary/logs/server/localhost-*.log` two hours with `touch -t 202001010000`, and launch again. The launch succeeds, every older per-run log is gone, the new log remains, and `latest.log` points at it. Failure looks like a timeout, an old log surviving, or a link to a deleted log.
5. **Link cannot be updated.** Stop the app and wait for `<scratch>/.janissary/lock` to disappear, replace `latest.log` with a regular file containing sentinel bytes, and launch again. The launcher exits 0, stdout contains the URL alone, stderr contains exactly `warning: could not update <scratch>/.janissary/logs/server/latest.log: not a symbolic link` followed by a newline, the regular file still holds its sentinel bytes, and no `latest.log.*.tmp` entry remains. Failure looks like a missing or duplicate warning, a nonzero exit, changed sentinel bytes, or a leftover temporary link.
6. Stop the final instance with `node bin/janus.mjs stop <scratch>`.
