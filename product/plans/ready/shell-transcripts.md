# Persist shell transcripts under .janissary/transcripts/shell/ with launch-time retention

**Complexity: 6/10** — 16 requirements, 6 production files, 8 test scenarios, ~20 added lines (p=5.90)

## Goal

The feature text: "every new shell tab should create a new file in .janissary/transcripts/shell/. The activity of the shell session should be continually appended to the file for the duration of the session. The shell transcripts should persist for N number of days where N is determined by the configuration flag in .janissary/config.json. the log reaper process that runs in the background on launch should be responsible for clearing out transcripts older than n days. shell transcripts should not be removed when the application is halted. shell transcripts should be tested. Prexisting code to save transcripts should be updated and used for the implementation of the current feature."

Today every recorded shell tab already writes a plain-text transcript, but it lands in `.janissary/shell-transcripts/` and that whole directory is deleted at every launch. So a shell session's history is gone the moment Janissary restarts. This plan moves those transcripts under `.janissary/transcripts/shell/` and stops clearing them. The launch sweep that already ages out harness transcripts by `logRetentionInDays` ages these out too. Writing them is switched by `logEnabled`, the same setting that switches harness transcripts, instead of `recordShellTabs`.

## Requirements

1. A shell tab's transcript file is written to `.janissary/transcripts/shell/<label>-<timestamp>.txt` ("every new shell tab should create a new file in .janissary/transcripts/shell/").
2. Every row the session displays on its normal screen is appended to the file for the life of the shell ("continually appended to the file for the duration of the session").
3. `.janissary/transcripts/shell/` is not cleared at launch (user answer: "no longer clear on launch or shutdown").
4. No shell transcript is deleted when the application stops ("shell transcripts should not be removed when the application is halted"; user answer: "no longer clear on launch or shutdown").
5. Once per launch, a background sweep deletes shell transcripts whose last-modified time is more than `logRetentionInDays` days before launch ("the log reaper process that runs in the background on launch should be responsible for clearing out transcripts older than n days"; user answer: "Share logRetentionInDays").
6. A `logRetentionInDays` of `0` makes the sweep delete every shell transcript last modified before launch (user answer: "Share logRetentionInDays", whose `0` means keep none from earlier runs).
7. The sweep never deletes a shell transcript last modified at or after launch, including when `logRetentionInDays` is `0`.
8. The sweep deletes only regular `*.txt` files directly inside `.janissary/transcripts/shell/`.
9. The sweep runs at launch whether `logEnabled` is true or false (user answer: "Yes, always reap").
10. The sweep never delays startup.
11. With `logEnabled` false, no shell tab writes a transcript file (user answer: "logEnabled only").
12. With `logEnabled` false, no shell tab draws an **Open transcript** button, because no transcript file opens (user answer: "logEnabled only").
13. With `recordShellTabs` false and `logEnabled` true, a shell tab still writes its transcript file (user answer: "logEnabled only").
14. With `recordShellTabs` false and `logEnabled` true, a shell tab draws its **Open transcript** button once the file opens (user answer: "logEnabled only").
15. The legacy `.janissary/shell-transcripts/` directory is no longer created or written (user answer: "Ignore it").
16. The legacy `.janissary/shell-transcripts/` directory is no longer cleared at launch (user answer: "Ignore it").

## Design decisions

- Reuse the existing `ShellTranscriptWriter` and `ShellTranscriptManager` unchanged; only the directory, its launch policy, and the install gate change ("Prexisting code to save transcripts should be updated and used for the implementation of the current feature"; Assumptions 1 and 2).
- Share `logRetentionInDays` between harness and shell transcripts rather than adding a shell-only key, so the config, its decoder, and its backfill are untouched (user answer: "Share logRetentionInDays"; Assumptions 9 and 10).
- Gate the shell transcript writer on `logEnabled` alone and gate only the `.cast` recording on `recordShellTabs` (user answer: "logEnabled only"). The plugin's `recordsTerminal` declaration still gates both, so a `!` PTY from another tab or a third-party plugin terminal still gets neither (Assumption 6). The flag is read when the terminal is adopted into its tab, the way `recordShellTabs` is read today, so a change applies to tabs opened after the next launch.
- Measure age by file mtime and fix the cutoff at launch time minus `logRetentionInDays` days, the semantics the harness sweep already has, so a running or just-ended session is never reaped (Existing functionality 2 and 3).
- Mirror the harness wrapper: `src/shell/transcript/transcript-file.ts` owns the shell call into the generic reaper through an async `reapShellTranscripts(launchedAt, days)` that returns untouched when the directory has not been initialized (Existing functionality 3).
- Start the shell sweep from `src/main.ts` beside the harness sweep, without awaiting it and with a swallowing rejection handler, reading `logRetentionInDays` from the `Config` that `loadConfig(cwd)` already returns (Assumption 8; user answer: "Yes, always reap").
- Stop clearing shell transcripts by removing the `clear` from the `shellTranscript` registry entry, as the `harnessTranscript` entry already does (Existing functionality 4; user answer: "no longer clear on launch or shutdown").
- Leave `.janissary/shell-transcripts/` from older versions untouched, with no migration and no clearing (user answer: "Ignore it"). Ceiling: files an older version left there stay until the user deletes them. Upgrade path: a clear-only `STATE_DIRECTORY_ENTRIES` entry for the legacy path.
- Sweep once per launch only, not on a recurring timer (user answer: "Transcripts only").
- Record the user documentation update as a follow-up feature candidate, not as part of this plan. User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan (user answer: "Prose page candidate").

## Preserved behavior

1. The transcript file is created lazily on the shell's first output. A shell that finishes before printing anything must not leave an empty file. Test: `src/shell/transcript/writer.test.ts` "creates no file before the first output".
2. The cursor's unfinished row is written when the shell exits. The final prompt or progress row must not be dropped. Test: `src/shell/transcript/writer.test.ts` "writes the unfinished cursor row on exit".
3. Nothing is written while a full-screen program holds the alternate screen. Alternate-screen rows must not reach the file. Test: `src/shell/transcript/writer.test.ts` "writes nothing from the alternate screen".
4. A save over a transcript that a running shell is still writing is refused, with the file's bytes untouched. The editor must not replace the live file. Test: `src/editor/save.test.ts` "refuses a save over a transcript still being written, notifying the tab and leaving its bytes untouched".
5. Renaming a live transcript's editor tab is refused and the file stays in place. The file must not move while the shell still writes it. Test: `src/tab/rename-editor.test.ts` "refuses to rename a shell transcript that is still being written and leaves it in place".
6. Moving a live transcript from a file navigator is refused. It must not move while the shell still writes it. Test: `src/file-navigator/manager/mutations.test.ts` "refuses without moving when the source is a live transcript".
7. A tab's transcript failure is reported once per open tab. It must not be repeated for a second writer of the same tab, and must not be suppressed for a later tab reusing the label. Test: `src/shell/transcript/manager.test.ts` "notifies a tab's failure once across its writers, and again after the tab is closed".
8. At shutdown the app waits up to one second for open transcripts to write their final row. It must not hang on a writer that never settles. Test: `src/shell/transcript/manager.test.ts` "stops waiting for a writer that never settles after the shutdown wait".
9. The **Open transcript** button opens the tab's transcript file from the tab record. It must not open another tab's file, and it must do nothing before the file has opened. Test: `src/controller/transcript.test.ts` "opens a shell tab's transcript from its tab record when it has no tailer".
10. A plugin whose declaration does not ask for recording gets neither a recording nor a transcript. Its terminal output must not be written to disk. Test: `src/tab/manager.test.ts` "records nothing for a plugin whose declaration did not ask for it".
11. Captures, recordings, browser logs, git-failure output, the workspace directory, and the remote file cache are still cleared at every launch. None of them may lose its clear. Test: `src/state/dirs.test.ts` "clears every entry with a clear on every launch".
12. Harness transcripts are still kept across launches and still never cleared at launch. The harness entry must not gain a clear. Test: `src/state/dirs.test.ts` "never clears the harness transcript directory".

## Assumptions

1. Shell transcripts are already written continuously, one writer per recorded PTY, appending each finished normal-screen row: `src/shell/transcript/writer.ts:31` `export class ShellTranscriptWriter`.
2. The file is created lazily on the shell's first output: `src/shell/transcript/writer.ts:85` "Opening the file on the first output".
3. The directory today is `.janissary/shell-transcripts/`: `src/shell/transcript/transcript-file.ts:11` `path.join(projectDirectory, '.janissary', 'shell-transcripts')`.
4. That directory is cleared at every launch through the state-directory registry: `src/state/dirs.ts:46` `clear: (): void => { clearShellTranscriptDirectory(); }`, run by `src/main.ts:78` `clearStateDirectories();`.
5. Nothing clears state directories on shutdown; boot is the only caller of `clearStateDirectories`: `src/main.ts:78` `clearStateDirectories();`.
6. Only shells whose plugin declares recording, and only while `recordShellTabs` is true, get a transcript writer today: `src/tab/manager.ts:247` `if (declares && getConfig().recordShellTabs) {`.
7. That one condition starts both the recording and the transcript writer: `src/tab/manager.ts:248` `registerShellObservers(ptyId, label)` and `src/tab/manager.ts:249` `this.managers.shellTranscript.install(ptyId, label);`.
8. A launch sweep already exists for harness transcripts, started without awaiting after the config is loaded: `src/main.ts:80` `void reapHarnessTranscripts(Date.now(), config.logRetentionInDays).catch(() => {});`.
9. `logRetentionInDays` and `logEnabled` already exist, decoded and backfilled with defaults `7` and `true`: `src/config-decode.ts:105` `const BACKFILLED_KEYS = ['maxToolTurns', 'logEnabled', 'logRetentionInDays']`.
10. Both settings govern harness transcripts only today: `product/specs/application-config.md:16` "it does not govern shell-tab transcripts or recordings".
11. The **Open transcript** button is drawn from the tab record's `transcript` alone, with no reference to the recording: `src/tab/view.ts:111` `const transcript = tab.transcript;`.
12. The tab record's `transcript` is set only when a writer's file opens: `src/shell/transcript/manager.ts:55` `tab.transcript = path;`.
13. `ShellTranscriptManager.install` is called from exactly one place, `recordTerminal`, and every shell opener, fresh or reattached, reaches it: `src/tab/manager.ts:249` `this.managers.shellTranscript.install(ptyId, label);` and `src/tab/openers.ts:180` `target.recordTerminal(ptyId, minted.label, pluginId)`.

## Existing functionality

1. The shell transcript directory's init/ensure/path/clear functions: `src/shell/transcript/transcript-file.ts:10` `initShellTranscriptDirectory`.
2. The generic age-based reaper over one directory's direct `*.<ext>` files: `src/state/reaper.ts:7` `reapFilesOlderThan`.
3. The harness directory's reaper wrapper, with the day arithmetic and uninitialized guard: `src/harness/transcript-file.ts:26` `reapHarnessTranscripts`.
4. The state-directory registry, including entries deliberately left without a `clear`: `src/state/dirs.ts:37` "No `clear`, deliberately".
5. The retention setting, decoded with `0` valid: `src/config-decode.ts:127` `logRetentionInDays: nonNegativeIntegerValue(record.logRetentionInDays, defaults.logRetentionInDays)`.
6. Reading a config flag when a tab's terminal is adopted: `src/tab/manager.ts:247` `getConfig().recordShellTabs`.

## Implementation steps

1. **Move the directory, stop clearing it, and sweep it.** In `src/shell/transcript/transcript-file.ts`, change the directory to `.janissary/transcripts/shell`. Remove `clearShellTranscriptDirectory` and the `rmSync` import, and add an async `reapShellTranscripts(launchedAt, days)` that returns without calling the reaper when the directory is not initialized and otherwise calls `reapFilesOlderThan(<directory>, '.txt', launchedAt - days * DAY_MS)`, mirroring `reapHarnessTranscripts` at `src/harness/transcript-file.ts:26`, with its own module-private `DAY_MS = 86_400_000` as the harness file has. It imports `reapFilesOlderThan` from `../../state/reaper.js`; the reaper imports nothing from `src/shell/`, so the existing `src/state/dirs.ts` → `src/shell/transcript/transcript-file.ts` import does not become a cycle. Rewrite the file's header comment to state the retention policy. In `src/state/dirs.ts`, drop the `shellTranscript` entry's `clear` and its import, keeping its `init`, with a comment like the `harnessTranscript` one on why it has no clear. In `src/main.ts`, start `reapShellTranscripts(Date.now(), config.logRetentionInDays)` beside the harness sweep, unawaited with a swallowing `.catch`. Fix the comment in `src/harness/transcript-file.ts:6` that calls the harness directory "the only thing under `.janissary/transcripts/`". Update `src/shell/transcript/transcript-file.test.ts`, `src/state/dirs.test.ts` (drop the `clearShellTranscriptDirectory` mock and its expectation), and the `.janissary/shell-transcripts` paths in `src/shell/transcript/manager.test.ts:60` and `src/shell/transcript/writer.test.ts:57`, which read the files the real writer creates. The literal `.janissary/shell-transcripts/...` strings in `src/tab/view.test.ts:828` and `src/controller/transcript.test.ts:68` are opaque fixture values that no code resolves, so they stay. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Gate the writer on `logEnabled`.** In `TabManager.recordTerminal` (`src/tab/manager.ts:244`), keep the `recordsTerminal` declaration check over both, call `registerShellObservers` only when `getConfig().recordShellTabs` is true, and call `shellTranscript.install` only when `getConfig().logEnabled` is true. Both callers, the fresh-tab opener and the reattach opener (`src/tab/openers.ts:180` and `:217`, `target.recordTerminal(ptyId, ...)`), reach this one method, so local shells, remote shells, and their siblings all follow the new gate with no other change. `src/tab/manager.ts` is at exactly the 200-line `max-lines` limit today (blank and comment lines skipped), so the change must not add a counted line: replace the combined `if (declares && getConfig().recordShellTabs) { ... }` block with an early return when `declares` is false followed by two single-statement guarded calls, which counts one line fewer. Rewrite the method's comment, whose last sentence says "The text transcript follows the recording's gate exactly."; comment lines are not counted. Update `src/tab/manager.test.ts`: "records nothing when the project turned shell recording off in its config" now expects `install` to be called, and new tests cover `logEnabled` false. Fix the `logEnabled` and `logRetentionInDays` comments in `src/config.ts:50-55`, which say harness only. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Specs.** Update `product/specs/shell-tab.md` § Text transcript (directory, kept for `logRetentionInDays` and swept at launch instead of "cleared at every launch", `logEnabled` as the opt-out in "Which shells keep one" and "Input exposure") and the metadata-row sentence at line 307 about `recordShellTabs` and the button. Update the `recordShellTabs`, `logEnabled`, and `logRetentionInDays` rows in `product/specs/application-config.md` so `recordShellTabs` no longer gates the text transcript and the other two cover shell transcripts. Update `product/specs/harness-recording.md:85`, which says `recordShellTabs` turns the text transcript off and names the old directory. Update the last sentence of the recording paragraph in `product/specs/tab-plugins.md:281`, "A recorded terminal also gets a plain-text transcript of what it displayed, under the same gate", so the transcript follows the `recordsTerminal` declaration and `logEnabled` while the recording follows the declaration and `recordShellTabs`. Update `product/specs/state-directory.md:5` to add shell transcripts beside harness transcripts as kept and swept. The state path lists in `ai/tasks/workspace/start-application.md:46` and `ai/tasks/workspace/stop-application.md:41` already name `transcripts/` and never named `shell-transcripts/`, so they need no edit. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

The only visible change is when the existing **Open transcript** button appears. Every UI category is settled by the existing component and the Phase 1 answers, so no UI question was asked.

1. Placement, layout, and visual style are unchanged: the clipboard-icon button in the shell tab's metadata row, `web/src/plugins/shell/ShellTabMeta.tsx:94` `className="tab-open-transcript"`.
2. Interaction is unchanged: pressing it opens the transcript in an editor tab named `<label>-<timestamp>.txt`, now from `.janissary/transcripts/shell/`.
3. States: the button is absent until the transcript file opens and stays once drawn, as today. It now follows `logEnabled` instead of `recordShellTabs` (Requirements 12 and 14), so a tab with recording off can show the button with no recording flag beside it.
4. Keyboard and accessibility are unchanged: no new binding, and the tooltip and accessible name stay `Open transcript`.
5. No client code changes; the server already sends `transcript` on the tab envelope only when it has opened (Assumptions 11 and 12).

## Tests

- `src/shell/transcript/transcript-file.test.ts`: "ensures a directory distinct from the other transcript directories" and "builds a .txt filename from label and startedAt" expect `.janissary/transcripts/shell` (Requirements 1, 15). Delete the `clearShellTranscriptDirectory` describe block. Add "reaps .txt files older than the retention window" (one reaper call with the directory, `.txt`, and `launchedAt - 7 * 86_400_000`), "uses launch as the cutoff when retention is zero", and "reaps nothing before a directory has been chosen", mocking `../../state/reaper.js` (Requirements 5, 6, 7, 8).
- `src/state/dirs.test.ts`: add "never clears the shell transcript directory" asserting the `shellTranscript` entry has no `clear` (Requirements 3, 4, 16). Drop the shell expectation and mock from "clears every entry with a clear on every launch", which keeps its other six expectations.
- `src/tab/manager.test.ts`: change "records nothing when the project turned shell recording off in its config" to expect no `registerShellObservers` call but one `shellTranscript.install` call (Requirement 13). Add "writes no shell transcript when logEnabled is false" expecting `registerShellObservers` called and `install` not called (Requirement 11).
- `src/shell/transcript/manager.test.ts` and `src/shell/transcript/writer.test.ts`: the real-filesystem fixtures read files from `.janissary/transcripts/shell`, so the existing write tests pin Requirements 1 and 2 at the new path.
- Requirements 12 and 14 need no new test: the button follows `tab.transcript` alone (Assumptions 11 and 12), set only by an installed writer, and `web/src/plugins/shell/ShellTab.test.tsx` "renders no transcript control while the host has supplied no transcript" and `src/tab/view.test.ts` "omits the transcript key from a plugin tab whose transcript has not opened" already pin that link.
- Requirements 9 and 10 are the unconditional, unawaited, rejection-handled call in `src/main.ts`, which has no test file; they are confirmed in Verification. The reaper's own mtime, extension, and direct-entry rules are pinned by the existing `src/state/reaper.test.ts`.

## Out of scope

- Shell `.cast` recordings keep their current behavior: cleared at launch and gated by `recordShellTabs` (user answer: "Transcripts only").
- A PTY started with `!` from another tab still keeps no transcript (user answer: "Transcripts only").
- No recurring sweep while the app runs; reaping happens once per launch (user answer: "Transcripts only").
- No runtime command to change either setting; the user edits `.janissary/config.json`.
- No change to the transcript's content, format, file name, size limits, or failure handling (user answer: "Transcripts only").
- No new config key; `logRetentionInDays` and `logEnabled` are reused as they are (user answer: "Share logRetentionInDays").
- No migration or cleanup of a legacy `.janissary/shell-transcripts/` directory (user answer: "Ignore it").
- Documentation follow-up feature candidate: update the user documentation's shell transcript section (path `.janissary/transcripts/shell/`, retention by `logRetentionInDays`, `logEnabled` as the switch) and the configuration reference. User and developer documentation is owned by `update-documentation.md`, not by a feature PR or plan.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **A shell writes a persistent transcript.** In a scratch project, launch Janissary, open a `shell` tab, and run `echo hello`. `.janissary/transcripts/shell/` holds one `<label>-<timestamp>.txt` containing the prompt and `hello`, and **Open transcript** opens it. Quit Janissary and relaunch in the same project: the file is still there, unchanged. A failure looks like a file under `.janissary/shell-transcripts/`, no file, or the file gone after relaunch.
3. **The sweep ages files out.** With Janissary stopped, backdate one shell transcript by ten days (`touch -t`) and leave another current. Relaunch with the default config: within a few seconds the backdated file is gone, the current one remains, and the UI opened without waiting. Set `"logRetentionInDays": 0` and relaunch: every shell transcript from earlier runs is gone, and the launch shell of this run still writes a new file. A failure looks like the backdated file surviving or a current-run file deleted.
4. **`logEnabled` off.** Set `"logEnabled": false`, backdate a shell transcript by ten days, and relaunch. Open a `shell` tab and run a command: no new file appears in `.janissary/transcripts/shell/`, the tab shows no **Open transcript** button, and the backdated file was still deleted. A failure looks like a new file or a surviving backdated file.
5. **`recordShellTabs` off.** Set `"recordShellTabs": false` with `"logEnabled": true` and relaunch. Open a `shell` tab and run a command: a transcript file appears and **Open transcript** is drawn, but no `.cast` recording appears and no recording flag is drawn.
