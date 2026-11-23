# Move harness transcripts to `.janissary/transcripts/harness/`

**Complexity: 2/10** — 3 requirements, 4 test scenarios, 3 files edited (two of them comment-only), ~8 added lines (p=4.22)

## Goal

The feature text asks that "every new harness tab should create a new file in .janissary/transcripts/harness/" and that "prexisting code to save transcripts should be updated and used". Today `HarnessTranscriptTailer` writes each harness tab's transcript to `.janissary/harness-transcripts/`. This subplan moves that directory to `.janissary/transcripts/harness/` and stops using the legacy one, keeping the existing lazy, append-only tailer. The directory is still cleared at every launch after this subplan; `product/plans/ready/harness-transcripts-4-retention-sweep.md` replaces that clear with the retention sweep.

Source plan: `product/plans/complete/harness-transcripts.md` (the directory half of implementation step 3 and the path parts of step 5). Run order: 3 of 5. Depends on no earlier subplan: it touches no config setting from `product/plans/ready/harness-transcripts-1-log-config-settings.md` and no reaper from `product/plans/ready/harness-transcripts-2-generic-reaper.md`, so it builds green on `master` alone.

## Requirements

1. A harness tab's transcript file is written to `.janissary/transcripts/harness/<label>-<timestamp>.txt` (source Requirement 1; feature text: "every new harness tab should create a new file in .janissary/transcripts/harness/").
2. Each harness tab writes its own new file, never one shared with or reused from another tab (source Requirement 2; feature text: "every new harness tab should create a new file").
3. The legacy `.janissary/harness-transcripts/` directory is no longer created, written, or cleared (source Requirement 25; user answer: "Ignore it").

## Design decisions

- Keep lazy file creation in `HarnessTranscriptTailer`; only the directory moves (user answer: "Lazily, first entry"; Assumption 2).
- Change only the path built by `initHarnessTranscriptDirectory`. `ensureHarnessTranscriptDirectory` already creates missing parents with `recursive: true`, so `.janissary/transcripts/` is created on demand and needs no new init (Assumption 3). `harnessTranscriptPath`, `ensureHarnessTranscriptDirectory`, and `clearHarnessTranscriptDirectory` keep their names and signatures, so `src/harness/transcript/tailer.ts` and `src/state/dirs.ts` need no code change.
- Requirement 2 needs no new code. The per-tab file already follows from one fresh tailer per harness runtime, each with its own label and `startedAt` (Assumption 6); this subplan only adds a test that pins it.
- Leave `.janissary/harness-transcripts/` from older versions untouched, with no migration and no clearing (user answer: "Ignore it"). Ceiling: files an older version wrote there stay until the user deletes them. Upgrade path: a clear-only `STATE_DIRECTORY_ENTRIES` entry for the legacy path.
- `.janissary/transcripts/` has no other owner in the code, so placing harness transcripts under it collides with nothing (Assumptions 4 and 8). The comments and spec sentences that call that directory `TranscriptStore`'s, or say it holds ordinary tabs' logs, are stale and are corrected here.
- The existing clear-at-launch keeps applying to the moved directory in this subplan, because `clearHarnessTranscriptDirectory` removes whatever `initHarnessTranscriptDirectory` set (Assumption 7). Subplan 4 (`product/plans/ready/harness-transcripts-4-retention-sweep.md`) removes it, along with the `clearHarnessTranscriptDirectory` describe block in `src/harness/transcript-file.test.ts`; this subplan keeps that block and only updates its expected path.
- Replace every legacy mock path string `/project/.janissary/harness-transcripts/claude-now.txt` in `src/harness/transcript/tailer.test.ts`, `src/harness/manager.test.ts`, and `src/controller/transcript.test.ts` with `/project/.janissary/transcripts/harness/claude-now.txt`, so a grep for `harness-transcripts` under `src/` finds nothing. These strings are opaque mock values; the assertions keep their meaning. The `/project/.janissary/shell-transcripts/...` strings in `src/controller/transcript.test.ts` are shell transcripts and stay as they are.
- `product/specs/harness.md` § Session transcript and `product/specs/state-directory.md` name no harness transcript path, so neither changes in this subplan (Assumption 9).
- In the state path lists of `ai/tasks/workspace/start-application.md` and `ai/tasks/workspace/stop-application.md`, replace `harness-transcripts/` with `transcripts/harness/` and keep the existing `transcripts/` item, which now exists as its parent. The lists' stale `src/state-dirs.ts` reference is not this subplan's to fix.
- Prove claude, codex, and opencode write into the new directory by a manual run of each harness in Verification, relying on the existing per-harness source tests for parsing (user answer: "Manual run only"; Assumption 5).

## Preserved behavior

1. `harness transcript <name>` opens the tab's own transcript file in an editor once the tailer has written one. It must not report `No transcript available for "<name>" yet.` while a file exists, and must not open a file from another tab or an earlier run. Test: `src/harness/manager.test.ts` "opens the transcript file in the editor once one exists".
2. The harness tab's 📋 button opens the tailer's transcript file. It must not fall through to the tab record or open nothing while the tailer has a file. Test: `src/controller/transcript.test.ts` "opens the tailer's transcript file in an editor tab".

## Assumptions

1. The transcript directory is set once at boot by `initHarnessTranscriptDirectory` to the legacy path: `src/harness/transcript-file.ts:12` `transcriptDirectory = path.join(projectDirectory, '.janissary', 'harness-transcripts');`.
2. The transcript file is created lazily on the first entry, not at tab open: `src/harness/transcript/tailer.ts:16` "opened lazily on the first entry (a harness that never produces one leaves no empty file)".
3. The directory is created with missing parents before the file is opened: `src/harness/transcript-file.ts:16` `mkdirSync(transcriptDirectory, { recursive: true });`, called from `src/harness/transcript/tailer.ts:78` `ensureHarnessTranscriptDirectory();`.
4. `.janissary/transcripts/` has no current owner in the code: the only references in `src/` are comments naming the removed `TranscriptStore` (`src/harness/transcript-file.ts:5` "deliberately not `.janissary/transcripts/`" and `src/shell/transcript/transcript-file.ts:5` "distinct from `.janissary/transcripts/`").
5. Session transcripts are produced for claude, codex, and opencode from their own session records: `src/harness/transcript/sources.ts:10` `export function createTranscriptSource(`.
6. Each harness runtime constructs a fresh tailer with its own `startedAt`, and the file name carries the label and that timestamp, so every tab gets its own file: `src/harness/observers.ts:65` `new HarnessTranscriptTailer(label, source,` and `src/harness/transcript/tailer.ts:24` `private readonly startedAt = Date.now();`.
7. The clear removes whatever directory was initialized: `src/harness/transcript-file.ts:26` `rmSync(transcriptDirectory, { recursive: true, force: true });`.
8. Ordinary tabs' transcript entries are logged under `.janissary/log/`, not `.janissary/transcripts/`: `src/transcript/logger.ts:25` `logDir = path.join(projectDir, '.janissary', 'log');`.
9. The harness command spec defers the file location to the recording spec, and the state-directory spec names no harness transcript path: `product/specs/harness.md:1003` "file naming, and the fallback when no session record can be found" and `product/specs/state-directory.md:5` "harness capture, recording and transcript files".

## Existing functionality

1. The transcript directory's init/ensure/path/clear quartet: `src/harness/transcript-file.ts:11` `initHarnessTranscriptDirectory`.
2. The per-tab artifact filename scheme `<label>-<ISO timestamp><ext>`: `src/harness/artifact-name.ts:8` `harnessArtifactFilename`.
3. The tailer's single long-lived append stream: `src/harness/transcript/tailer.ts:80` `createWriteStream(this.file, { flags: 'a' })`.
4. The header-comment wording for a directory whose clear comes from its registry entry: `src/shell/transcript/transcript-file.ts:7` "The clear-at-every-launch policy comes from this directory's entry in".

## Implementation steps

1. **Move the directory.** In `src/harness/transcript-file.ts`, change `initHarnessTranscriptDirectory` to join `.janissary`, `transcripts`, `harness`. Rewrite the header comment: the directory is `.janissary/transcripts/harness/`, nothing else lives under `.janissary/transcripts/`, and (for now) it is cleared at every launch through its entry in `src/state/dirs.ts`, worded like the shell transcript header (Existing functionality 4) rather than the current "from `src/main.ts`". Change the path in the class comment of `src/harness/transcript/tailer.ts` (line 16, `.janissary/harness-transcripts/` becomes `.janissary/transcripts/harness/`). Rewrite the header comment of `src/shell/transcript/transcript-file.ts` so it says the shell transcripts are distinct from `.janissary/transcripts/harness/` (harness session transcripts), with no mention of `TranscriptStore` or a bare `.janissary/transcripts/`, and keep its closing sentence about the clear policy coming from `src/state/dirs.ts`. In `src/harness/transcript-file.test.ts`, change the expected directory to `path.join('/test/project', '.janissary', 'transcripts', 'harness')` in both places it appears (the ensure test and the `clearHarnessTranscriptDirectory` describe block), rename the first test to "ensures .janissary/transcripts/harness under the project", and strengthen "builds a .txt filename from label and startedAt" to assert the whole path equals `path.join('/test/project', '.janissary', 'transcripts', 'harness', 'claude-2026-07-10T18-30-05-123Z.txt')` instead of `toContain` on the filename. Replace the legacy mock path strings in `src/harness/transcript/tailer.test.ts` (the `vi.mock('../transcript-file.js', ...)` factory and the "accumulates entries" assertion), `src/harness/manager.test.ts` (both occurrences in "opens the transcript file in the editor once one exists"), and `src/controller/transcript.test.ts` (all four occurrences). Add the two-tailer test to `src/harness/transcript/tailer.test.ts` (see Tests). No production file approaches the 200-line limit (`transcript-file.ts` is 27 lines, `tailer.ts` 104). Build command: `$janissary/scripts/run.mjs check-diff`, which must be green before step 2.
2. **Specs and agent playbooks.** In `product/specs/harness-recording.md` § Session transcripts, change the path on line 43 to `.janissary/transcripts/harness/<label>-<timestamp>.txt`. On lines 48-49, replace "It is separate from `.janissary/transcripts/`, which holds ordinary tabs' own logs." with two sentences: each harness tab gets its own file in that directory, and the `.janissary/harness-transcripts/` directory earlier versions wrote is no longer used or cleared. Leave its "cleared at every launch" sentence alone; subplan 4 rewrites it. In `product/specs/shell-tab.md` § Text transcript (line 535), change `.janissary/harness-transcripts/` to `.janissary/transcripts/harness/`. In `ai/tasks/workspace/start-application.md` (line 46) and `ai/tasks/workspace/stop-application.md` (line 41), change `harness-transcripts/` to `transcripts/harness/` in the state path lists, keeping the existing `transcripts/` item. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The 📋 button and `harness transcript <name>` open whatever path the tailer reports; only the path changes.

## Tests

- `src/harness/transcript-file.test.ts`: `ensureHarnessTranscriptDirectory` creates exactly `.janissary/transcripts/harness` under the project (Requirement 1). The exact-equality assertion is what proves it is not `.janissary/harness-transcripts` (Requirement 3: not created). `harnessTranscriptPath` returns the full path under `.janissary/transcripts/harness` (Requirements 1, 3: not written). The existing clear tests assert the moved path (Requirement 3: the legacy directory is not what gets cleared).
- `src/harness/transcript/tailer.test.ts`: change the module-level `harnessTranscriptPath` mock to derive its return value from its label argument, `/project/.janissary/transcripts/harness/<label>-now.txt`, so the existing `claude` assertions still see `/project/.janissary/transcripts/harness/claude-now.txt` and no per-test `mockImplementation` leaks across tests. Add "writes each tab to its own file": a `claude` tailer and a `codex` tailer, each fed one entry, after one poll interval have called `createWriteStream` twice, once with each label's path, `harnessTranscriptPath` once per label, and each tailer's `transcriptFile()` returns its own label's path (Requirement 2). Dispose both tailers at the end, as the other tests do.
- Preserved behavior 1 and 2 are pinned by the named existing tests, whose mock path strings change but whose assertions do not.
- No new test for `src/shell/transcript/transcript-file.ts` or `src/state/dirs.ts`: the first changes only a comment, and the second does not change.

## Out of scope

- Stopping the clear at launch and the retention sweep: subplan 4.
- The `logEnabled` write gate: subplan 5.
- No migration or cleanup of a legacy `.janissary/harness-transcripts/` directory (user answer: "Ignore it").
- No new automated end-to-end test launching the real harness binaries (user answer: "Manual run only").
- Documentation follow-up feature candidate: the user documentation's harness transcript section still names `.janissary/harness-transcripts/` (`documentation/user-documentation/advanced-agents/harness.md`). User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Each harness writes into the new directory.** In a scratch project, launch Janissary, open `harness claude`, `harness codex`, and `harness opencode`, and send each one prompt. Within a few seconds of each reply, `.janissary/transcripts/harness/` holds one `<label>-<timestamp>.txt` per tab, each with that tab's entries, and `harness transcript <label>` opens that tab's file. `.janissary/harness-transcripts/` is not created. A failure looks like a missing file for any of the three harnesses, two tabs sharing one file, or a file under `.janissary/harness-transcripts/`. Relaunching still empties `.janissary/transcripts/harness/` at this subplan; that is expected until subplan 4.
3. **Legacy directory ignored.** With Janissary stopped, create `.janissary/harness-transcripts/old.txt` by hand, launch, open `harness claude`, and send a prompt. `old.txt` is still there, no new file appears beside it, and the new transcript lands in `.janissary/transcripts/harness/`. A failure looks like `old.txt` deleted or a new file under the legacy directory.
4. **Path grep.** `grep -rn "harness-transcripts" src ai/tasks/workspace` finds nothing, and `grep -rn "harness-transcripts" product/specs` finds only the `product/specs/harness-recording.md` sentence saying the legacy directory is no longer used or cleared. A match in `src/`, `ai/tasks/workspace/`, or `product/specs/shell-tab.md` means a reference was missed.
