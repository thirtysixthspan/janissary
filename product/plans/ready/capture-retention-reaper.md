# Keep captures in .janissary/captures/ across launches and reap them by age

**Complexity: 4/10** — 9 requirements, 4 production files, ~12 added lines (p=5.13)

## Goal

The feature text: "captures recorded into .janissary/captures should not be cleared on application start or launch, instead they should be reaped on the schedule set by the existing configuration parameter."

Today every capture file Janissary writes lands in `.janissary/captures/`, and that whole directory is deleted at every launch. A capture linked from the durable notification record or opened in an editor tab is gone the moment Janissary restarts. This plan stops clearing the directory at launch and has the existing background launch sweep age capture files out instead, the way it already ages out harness transcripts.

## Requirements

1. `.janissary/captures/` is not cleared at launch ("should not be cleared on application start or launch").
2. A capture file is kept for `logRetentionInDays` days, measured from its last modification ("reaped on the schedule set by the existing configuration parameter"; user answer: "Share logRetentionInDays").
3. A `logRetentionInDays` of `0` deletes every capture file last modified before launch (user answer: "Share logRetentionInDays", whose `0` means keep none from earlier runs).
4. The capture sweep runs once per launch ("reaped on the schedule"; user answer: "Once per launch").
5. The capture sweep never deletes a capture file last modified at or after launch, including when `logRetentionInDays` is `0` (user answer: "Once per launch").
6. The capture sweep never delays startup (user answer: "Once per launch").
7. The capture sweep runs at launch whether `logEnabled` is true or false (user answer: "No effect; always reap").
8. The capture sweep deletes only regular `*.txt` files directly inside `.janissary/captures/` (user answer: "Direct .txt files only").
9. The capture sweep never deletes a subdirectory, a symbolic link, or a file with another extension in `.janissary/captures/` (user answer: "Direct .txt files only").

## Design decisions

- Stop clearing captures by removing the `clear` from the `harnessCapture` registry entry, as the `harnessTranscript` entry already does (Existing functionality 3).
- Share `logRetentionInDays` between harness transcripts and captures rather than adding a capture-only key, so the config, its decoder, and its backfill are untouched (user answer: "Share logRetentionInDays"; Assumption 6).
- Sweep once per launch, started from `src/main.ts` beside the harness transcript sweep, unawaited with a swallowing rejection handler, with the cutoff fixed at launch time minus `logRetentionInDays` days, so a capture written during the current run is never reaped (user answer: "Once per launch"; Existing functionality 2 and 4). Ceiling: a run that stays up for weeks keeps every capture it writes until the next launch. Upgrade path: a recurring timer calling the same `reapHarnessCaptures`.
- Reuse `reapFilesOlderThan` unchanged with the `.txt` extension, so the sweep has the same direct-entry, regular-file, mtime, and silent-failure rules as the harness transcript sweep (user answer: "Direct .txt files only"; Existing functionality 1).
- Leave `logEnabled` governing harness transcripts only: it neither gates writing a capture nor skips the capture sweep, so no capture writer changes (user answer: "No effect; always reap"; Assumption 5).

## Preserved behavior

1. Recordings, shell transcripts, browser logs, git-failure output, the workspace directory, and the remote file cache are still cleared at every launch. None of them may lose its clear when the capture entry loses its own (user answer: "Only the other clears"). Test: `src/state/dirs.test.ts` "clears every entry with a clear on every launch".

## Assumptions

1. Every capture file is written through one function into one directory: `src/harness/capture/file.ts:17` `export function writeCaptureFile(label: string, capturedAt: number, text: string): string`.
2. The directory is `.janissary/captures/` under the project: `src/harness/capture/file.ts:8` `captureDirectory = path.join(projectDirectory, '.janissary', 'captures');`.
3. Every capture file name ends in `.txt`: `src/harness/capture/file.ts:18` `harnessArtifactFilename(label, capturedAt, '.txt')`.
4. The directory is cleared at every launch through the state-directory registry: `src/state/dirs.ts:29` `clear: (): void => { clearCaptureDirectory(); },`, run by `src/main.ts:78` `clearStateDirectories();`.
5. Six production modules, at eight call sites, write capture files, and none of them reads `logEnabled`: harness `capture` (`src/harness/subcommands.ts:35` and `:89`), the monitor context snapshot (`src/monitor/context.ts:39`), the ACP transcript snapshot (`src/controller/transcript.ts:32`), auto-resume (`src/harness/auto-resume-wire.ts:31`), auto-approve (`src/harness/auto-approve-wire.ts:23`), and remote gate and resume reports (`src/remote/pty-session.ts:78` and `:98`), each through `writeCaptureFile`.
6. The only existing retention parameter is `logRetentionInDays`, default `7`, with `0` keeping none from earlier runs: `src/config.ts:55` `logRetentionInDays: number;` and `src/config.ts:90` `DEFAULT_LOG_RETENTION_IN_DAYS = 7`.
7. The notification record persists across runs and keeps each notification's capture link: `src/notifications/record.ts:99` `...(notification.openFile && { openFile: notification.openFile })`.
8. The spec states the current clearing policy: `product/specs/harness.md:954` "Capture files accumulate only within a run: the directory is cleared at the next launch."

## Existing functionality

1. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
2. The harness transcript reaper wrapper, with the day arithmetic and uninitialized guard: `src/harness/transcript-file.ts:26` `reapHarnessTranscripts`.
3. The state-directory registry, including entries deliberately left without a `clear`: `src/state/dirs.ts:37` "No `clear`, deliberately".
4. The background launch sweep, started unawaited after the config loads: `src/main.ts:80` `void reapHarnessTranscripts(Date.now(), config.logRetentionInDays).catch(() => {});`.

## Implementation steps

1. **Stop clearing captures and sweep them by age.** In `src/harness/capture/file.ts`, remove `clearCaptureDirectory` and the `rmSync` import, and add an async `reapHarnessCaptures(launchedAt, days)` that returns without calling the reaper when the directory has not been initialized and otherwise calls `reapFilesOlderThan(<directory>, '.txt', launchedAt - days * DAY_MS)`, mirroring `reapHarnessTranscripts` at `src/harness/transcript-file.ts:26`, with its own module-private `DAY_MS = 86_400_000` as that file has. It imports `reapFilesOlderThan` from `../../state/reaper.js`; the reaper imports only `node:fs/promises` and `node:path`, so the existing `src/state/dirs.ts` → `src/harness/capture/file.ts` import does not become a cycle. Add a header comment stating the retention policy. `src/harness/capture/file.ts` and `src/main.ts` (85 counted lines) stay far under the 200-line limit, so no extraction is needed. In `src/state/dirs.ts`, drop the `harnessCapture` entry's `clear` and the `clearCaptureDirectory` import, keeping its `init`, with a comment like the `harnessTranscript` one on why it has no clear. In `src/main.ts`, start `reapHarnessCaptures(Date.now(), config.logRetentionInDays)` beside the harness transcript sweep, unawaited with a swallowing `.catch`. Update the `logRetentionInDays` comment in `src/config.ts:53`, which says harness transcripts only. Update `src/harness/capture/file.test.ts` (delete the two `clearCaptureDirectory` tests, add the reaper tests below), `src/state/dirs.test.ts` (drop the `clearCaptureDirectory` mock and its expectation, add the no-clear test), and the `clearCaptureDirectory` key in the `src/monitor/manager.test.ts:38` module mock. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Specs.** Update `product/specs/harness.md:952-954` so capture files are kept for `logRetentionInDays` days and swept at launch instead of "cleared at the next launch". Update `product/specs/harness-recording.md:190`, which says recordings are cleared "matching `.janissary/captures/`". Update `product/specs/state-directory.md:5` to move harness capture files from the per-run cleared list to the kept-and-swept sentence beside harness transcripts. Update the `logRetentionInDays` row in `product/specs/application-config.md` so it covers capture files, and the `logEnabled` row so it states that it does not govern captures. Build command: `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/harness/capture/file.test.ts`: add "reaps .txt files older than the retention window" (one reaper call with the captures directory, `.txt`, and `launchedAt - 7 * 86_400_000`), "uses launch as the cutoff when retention is zero", and "reaps nothing before a directory has been chosen", mocking `../../state/reaper.js` through `vi.hoisted` as `src/harness/transcript-file.test.ts` does, beside the file's existing whole-module `node:fs` mock (Requirements 2, 3, 5, 8). Delete the two `clearCaptureDirectory` tests.
- `src/state/dirs.test.ts`: add "never clears the harness capture directory" asserting the `harnessCapture` entry has no `clear` (Requirement 1). Drop the capture expectation and mock from "clears every entry with a clear on every launch", which keeps its other expectations.
- Requirements 4, 6, and 7 are the unconditional, unawaited, rejection-handled call in `src/main.ts`, which has no test file; they are confirmed in Verification. Requirement 9 and the reaper's mtime rule are pinned by the existing `src/state/reaper.test.ts`.

## Out of scope

- Recordings under `.janissary/recordings/` keep their launch clear, as do browser logs, git-failure output, shell transcripts, the workspace directory, and the remote file cache (user answer: "Captures only").
- No recurring sweep while the app runs; reaping happens once per launch (user answers: "Once per launch", "Captures only").
- No new config key; `logRetentionInDays` is reused as it is (user answers: "Share logRetentionInDays", "Captures only").
- No UI or command for listing or browsing captures from earlier runs (user answer: "Captures only").
- No change to how a capture is taken, its content, or its file name (user answer: "Captures only").
- `logEnabled` does not start gating capture writes; captures are still written with it false (user answer: "No effect; always reap").

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Captures survive a relaunch.** In a scratch project, launch Janissary, open a harness tab, let it print, and run `harness capture <name>`. `.janissary/captures/` holds one `<name>-<timestamp>.txt`. Quit and relaunch in the same project: the file is still there, unchanged. A failure looks like the directory gone or empty after relaunch.
3. **The sweep ages captures out.** With Janissary stopped, backdate one capture by ten days (`touch -t`), leave another current, and drop a ten-day-old `notes.md` beside them. Relaunch with the default config: within a few seconds the backdated capture is gone, the current one and `notes.md` remain, and the UI opened without waiting. Set `"logRetentionInDays": 0` and relaunch: every `.txt` capture from earlier runs is gone, `notes.md` remains, and a new `harness capture` in this run still writes a file. A failure looks like the backdated capture surviving, `notes.md` deleted, or a current-run capture deleted.
4. **`logEnabled` off.** Set `"logEnabled": false`, backdate a capture by ten days, and relaunch. The backdated capture is deleted, and `harness capture <name>` still writes a new file.
5. **Other per-run directories are still cleared.** After any relaunch above, `.janissary/recordings/` holds no file from the previous run.
