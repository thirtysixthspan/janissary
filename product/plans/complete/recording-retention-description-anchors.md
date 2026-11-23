# Anchor the recording-retention pull request's examples, screenshots, and verify steps to their proof

**Complexity: 1/10** — no production lines or files, 9 requirements, no test scenarios (p=3.20)

## Goal

The description of pull request #2199 states what keeping recordings and gating them on `logEnabled` does through three behavior examples, four screenshot captions, and the setup and eleven Do/Expect steps of How to verify, but none of them names the code path or test that proves the claim. A reviewer has to take each one on trust, and a later change that breaks a claim leaves the description still reading as true. This plan gives every one of those claims a pointer to its evidence, either a test by its exact name or, where no test exists, the code path with a note that it is checked by hand only. The claims themselves stay as written.

## Requirements

1. "Edit the pull request body so each example, caption, and Do/Expect pair names its proof without changing what it claims": each of the three Behavior examples carries a proof line.
2. Each of the four Screenshots captions is followed by a proof line.
3. Setup step 2 names its proof.
4. Each of How to verify steps 1 to 11 names its proof.
5. "Where a claim has no test, name the code path and say it is checked by hand only": the unawaited launch sweep, the sweep running regardless of `logEnabled`, the absent `.janissary/recordings/` directory, and the absent `shell recording failed` notification each say so.
6. Every cited test name matches an `it(` title in the named file exactly, using the current names rather than the ones the backlog entry quoted, so `src/terminal-runtime/manager.test.ts` "installs no shell runtime and leaves the tab unmarked when logEnabled is false" is cited, not the old "marks the tab not recording" name.
7. The shell tab's not-recording mark is anchored to `openPluginTab` in `src/tab/openers.ts`, where the repair moved it, pinned by `src/tab/manager.test.ts` "marks a recorded plugin's tab not recording from the moment it opens when logEnabled is false".
8. "Keep its existing sections, screenshots (pinned SHA links), and How to verify steps": the summary paragraph, the What section, the screenshot image links, and the closing note under How to verify are byte-for-byte unchanged.
9. The corrected paragraphs state no commit, file, or line counts and cite no commit SHA.

## Design decisions

- The anchors cite file paths, function names, and test titles, never line numbers, because a line number goes stale with the next edit to the file while a test title only changes when someone renames the test (Assumption 1).
- Each Behavior example gets a `Proof:` paragraph directly below its code block rather than comments inside the transcript, so the transcripts still read as terminal output.
- Each How to verify step gets a third `Proof:` line after its `Expect:` line, matching the existing Do/Expect layout.
- The four screenshot captions keep their alt text and links untouched; a single proof paragraph follows each image, because changing the alt text would change the caption the entry asks to keep.
- The description is edited only after the plan commit is pushed, per Step 8 of `ai/tasks/feature/work-pull-request-issue.md`.
- The What section's sentence saying the mark is set "when a shell terminal is declined" is left alone even though the repair moved the mark to `openPluginTab`, because the entry names only the examples, captions, and verify steps, and the task forbids editing paragraphs the work item does not name (Assumption 2).

## Preserved behavior

None found

## Assumptions

1. Each cited test exists under the quoted title: `src/state/dirs.test.ts:125` `it('never clears the harness recording directory'`, `src/state/dirs.test.ts:110` `it('clears every entry with a clear on every launch'`, `src/harness/recording-file.test.ts:75` `it('reaps .cast files older than the retention window'`, `src/harness/recording-file.test.ts:87` `it('uses launch as the cutoff when retention is zero'`, `src/harness/recording-file.test.ts:54` `it('harnessRecordingPath builds a .cast filename from label and startedAt'`, `src/state/reaper.test.ts:48` `it('keeps files whose mtime is at or after the cutoff'`, `src/state/reaper.test.ts:56` `it('leaves subdirectories and their contents untouched'`, `src/state/reaper.test.ts:65` `it('keeps files whose names do not end with the extension'`.
2. The shell tab is marked at open, not when its terminal is declined: `src/tab/openers.ts:160` `if (!getConfig().logEnabled && target.recordsTerminals(pluginId)) minted.recordingOff = true;`.
3. The runtime gate's current test title: `src/terminal-runtime/manager.test.ts:34` `it('installs no shell runtime and leaves the tab unmarked when logEnabled is false'`, and its counterpart `src/terminal-runtime/manager.test.ts:50` `it('installs a shell runtime when logEnabled is true'`.
4. The tab-manager tests: `src/tab/manager.test.ts:284` `it('records a plugin\'s terminal by default, including for a project that set no config'`, `src/tab/manager.test.ts:296` `it('writes no shell transcript when logEnabled is false'`, `src/tab/manager.test.ts:312` `it('marks a recorded plugin\'s tab not recording from the moment it opens when logEnabled is false'`.
5. The harness tests: `src/harness/observers.test.ts:138` `it('builds no recorder for a harness tab when logEnabled is false'`, `src/harness/observers.test.ts:169` `it('builds a recorder for a harness tab when logEnabled is true'`, `src/harness/manager.test.ts:1136` `it('marks a harness tab not recording from creation when logEnabled is false'`, `src/harness/manager.test.ts:1147` `it('leaves a harness tab unmarked when logEnabled is true'`, `src/harness/manager.test.ts:592` `it('records the session under the tab label and the shell program as the header command'`.
6. The client tests: `web/src/shared/RecordingFlag.test.tsx:20` `it('is a green button that opens the recording when there is one'`, `web/src/shared/RecordingFlag.test.tsx:53` `it('is a plain inert span labeled not recording when off, even with a handler'`, `web/src/shared/RecordingFlag.test.tsx:66` `it('keeps the pre-output label when not off'`, `web/src/plugins/shell/ShellTabMeta.test.tsx:26` `it('draws the Open transcript button when the host supplies the opener, and opens it on click'`, `web/src/plugins/shell/ShellTabMeta.test.tsx:37` `it('draws no Open transcript button when the host supplies no opener'`, `web/src/plugins/shell/ShellTabMeta.test.tsx:43` `it('draws the not-recording flag when the tab is not recording'`, `web/src/harness/HarnessTabMeta.test.tsx:7` `it('renders the recording flag as a pressable button once the tab has a recording'`, `web/src/harness/HarnessTabMeta.test.tsx:23` `it('renders the flag plain and unpressable before the tab has produced a recording'`, `web/src/harness/HarnessTabMeta.test.tsx:41` `it('draws the not-recording flag when the tab is not recording'`.
7. The config tests: `src/config.test.ts:74` `it('writes both harness log settings into a fresh config'`, `src/config.test.ts:300` `it('ignores a retired recordShellTabs key'`, `src/config.test.ts:325` `it('strips recordShellTabs when updateConfig writes the file'`, `src/config.test.ts:341` `it('does not rewrite a complete config just because it carries recordShellTabs'`, `src/config.test.ts:355` `it('writes no recordShellTabs key to a fresh config'`.
8. The play lookup and view mirror tests: `src/play/recording-search.test.ts:33` `it('answers the most recent of several recordings of one session'`, `src/tab/view.test.ts:824` `it('mirrors recordingOff onto the harness view and the plugin view'`.
9. The launch sweep is started unawaited and unconditionally in `boot`, with no test of either fact: `src/main.ts:84` `void reapHarnessRecordings(Date.now(), config.logRetentionInDays).catch(() => {});`.
10. The recordings directory is created only by a recorder opening its file: `src/harness/recorder.ts:42` `ensureRecordingDirectory();`.
11. The `theme` command persists through `updateConfig`: `src/commands/theme.ts:27` `const persisted = updateConfig({ theme: canonical });`.

## Existing functionality

1. The retired key is dropped on a load-time rewrite: `src/config.ts:135` `delete stripped.recordShellTabs;` in `loadConfig`.
2. The retired key is dropped on every settings write: `src/config.ts:170` `delete merged.recordShellTabs;` in `updateConfig`.
3. The harness tab's creation-time mark: `src/harness/tab-spawn.ts:40` `if (!getConfig().logEnabled) tab.recordingOff = true;` in `HarnessTabSpawn.spawnTab`.
4. The shell terminal's path to the runtime gate: `src/tab/manager.ts:244` `recordTerminal(ptyId: string, label: string, pluginId: string): void {`, which calls `registerShellObservers` at `src/terminal-runtime/manager.ts:37`.
5. The per-run clear of the browser log directory: `src/state/dirs.ts:55` `name: 'browserLog',` with its `clear`, run by `clearStateDirectories` at `src/state/dirs.ts:137`.
6. The newest-recording lookup `play` uses: `src/play/recording-search.ts:35` `export function findRecording(`.

## Implementation steps

1. **Record the plan and remove the backlog entry.** Move this plan to `product/plans/complete/` and remove the first entry from `product/backlog/pull-request.md`, leaving the other three byte-for-byte unchanged. Commit and push to `feature/recording-retention-reaper`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Edit the description.** Read the current body with `gh pr view 2199 --json body`, add the `Proof:` paragraph under each Behavior example and each screenshot, add a `Proof:` line to Setup step 2 and to each of How to verify steps 1 to 11, and apply the full body with `gh pr edit --body-file ./temp/pr-body.md`. Every other paragraph stays exactly as it was. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. The change is to the pull request description on GitHub; no application surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. Requirement 6 is met by checking each cited title against the test files before the body is applied, not by a new test.

## Out of scope

- Any source, test, or spec change.
- The What section, including its now slightly stale sentence on where a shell tab's mark is set.
- The pull request title.
- The other three entries in `product/backlog/pull-request.md`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read the updated description with `gh pr view 2199 --json body` and confirm that each of the three Behavior examples, each of the four screenshots, Setup step 2, and How to verify steps 1 to 11 carries a `Proof:` that names a file and either a quoted test title or a code path marked as checked by hand only. For each quoted title, `grep -n` the named file and find an `it(` with exactly that text. Confirm the summary paragraph, the What section, the four image links with their pinned SHA, and the closing note are unchanged from before the edit. A failure looks like a quoted title that matches no `it(`, a step with no `Proof:`, or any change to the claim text.
