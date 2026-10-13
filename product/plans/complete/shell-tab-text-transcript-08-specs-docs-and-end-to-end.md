# Shell tab text transcript 08: specs, user documentation, and end-to-end verification

**Complexity: 3/10** — prose edits across five specs, `help.md` and four user-documentation pages, each claim checked against shipped code, plus a sandbox-driven end-to-end pass that spans four app launches; no code.

## Goal

Make the specs and user documentation describe the shipped behavior, and verify the whole feature end to end in the running app, including the relaunch lifecycle and the `recordShellTabs: false` opt-out. This is the integration gate for subplans 01–07 and the four repair plans.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order step 9, the "Specs and documentation" section, and the "Verification" section. Do not edit the source plan.

## Dependencies

Subplans 01–07 (`product/plans/complete/shell-tab-text-transcript-0{1..7}-*.md`) and the repair plans `product/plans/complete/shell-transcript-writer-unparsed-output-limit.md`, `shell-transcript-ignore-released-writer-failures.md`, `shell-transcript-per-tab-failure-state.md` and `shell-transcript-stale-failure-reused-label-test.md`. All are implemented and committed on this branch; the documentation below describes that code.

## Shipped behavior the documents must state (verified against the code)

Every user-visible claim below was checked; write the documents from this list, not from the source plan's wording where the two differ.

- **Gate.** The transcript is installed on exactly the terminals a shell recording is installed on, behind the same `recordsTerminal` declaration and `getConfig().recordShellTabs` check (`TabManager.recordTerminal`, `src/tab/manager.ts:230`, calling `registerShellObservers` and `shellTranscript.install` together). So the launch `janus` shell, every `shell` tab, remote shells and remote siblings get one; a PTY started with `!` from another tab does not (the same exclusion `product/specs/harness-recording.md` § "What is **not** recorded" states for recordings).
- **File and name.** `<project>/.janissary/shell-transcripts/<label>-<ISO-timestamp>.txt`, the label sanitized and the timestamp's `:`/`.` replaced by `-` (`harnessArtifactFilename`, `src/harness/artifact-name.ts`; `shellTranscriptPath`, `src/shell/transcript/transcript-file.ts`). The writer and the recorder each take `Date.now()` at construction, so a tab's `.txt` and `.cast` are **named alike, but the timestamps may differ by a few milliseconds** (the settled decision in `product/plans/complete/shell-tab-text-transcript-04-transcript-writer.md`, "Shared stem"). The spec must not say the two share a stem or are identically named.
- **Lazy creation.** The file opens on the shell's first output (`ShellTranscriptWriter.onData` → `open()`, `src/shell/transcript/writer.ts`); zsh's first prompt provides that at once. A shell finished before any output leaves no file.
- **Content.** Every normal-screen row as displayed: prompts, typed command lines, output, background-job output, startup-file output. No separators, timestamps or annotations. Rows are written as plain text (`translateToString(true)`, right-trimmed), so no escape sequence or colour reaches the file.
- **Row timing.** A row is written once, the first time the cursor moves below it (`TranscriptRowTracker.onLineFeed`, `src/shell/transcript/row-tracker.ts`), at the width the terminal had then; it is never revisited, so a later redraw keeps its first form and `clear` removes nothing already written. A row redrawn by carriage returns before the cursor leaves it is written once in its final form. Three accepted imperfections, stated in the row tracker's class comment and in `SCROLLBACK_ROWS`'s comment in the writer: after a program erases the screen below rows already written (zsh does this when it clears a completion list), the row above the cursor can be written a second time in its current form; rows that auto-wrapped between such an erase and the next line feed keep only their last row; and a single unbroken line longer than 1000 terminal rows keeps only the row it ends on.
- **Alternate screen.** Nothing is written while the alternate buffer is active (vim, less, top); normal-screen output before and after is.
- **Input exposure (decision 4).** Input is persisted as the terminal echoed it. A secret on a command line (`export TOKEN=…`) or echoed by an interactive program (a python REPL, `read`) lands in the file; a password typed at a prompt that turns echo off (`sudo`, `ssh`, `psql`) prints nothing, so nothing of it reaches the file. Mitigations: under the project's own `.janissary/`, never served over the network or handed to a client except when the user presses **Open transcript**, cleared at the next fresh launch; `recordShellTabs: false` is the opt-out.
- **Application replies.** A reply such as `help`'s and its echoed command line are drawn by the browser, never pass through the PTY, and never reach the file.
- **Size and failure.** No cap on the file. The transcript stops for the rest of the session, after the rows already finished, in three cases: an unwritable directory (the file never opens), more than 4 MiB waiting to reach disk (`MAX_PENDING_APPEND_BYTES`, `src/bounded-append-file.ts`), or output arriving faster than it can be transcribed (more than `MAX_UNPARSED_CHARS`, 4 Mi characters, waiting to be parsed, `src/shell/transcript/writer.ts`). After a failure the cursor's unfinished row is not written. The shell and the recording are unaffected.
- **Failure notice.** One `shell transcript failed` line in the notifications feed for that tab (`src/notifications/format.ts`, `'shell-transcript-failed'`), an explicit event, so it is recorded even while that tab is the active one and raises the desktop alert and bell like the recording-failed events. At most one line per open tab however many of its writers fail; nothing for a failure that surfaces only after the tab has closed (whether its shell exited first or the close released it); a later tab reusing the label is reported afresh (`ShellTranscriptManager`, `src/shell/transcript/manager.ts`, `TabFailureState` and the `released` set).
- **End of session.** When the tab closes or zsh exits, the cursor's unfinished row (a waiting prompt, a progress bar) is written as-is, then the file closes. At application shutdown the app waits up to one second (`SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS`) for every open transcript to write its final row and close.
- **Lifecycle.** Cleared at a fresh launch, preserved across `--relaunch` (`shellTranscript` entry, `always: false`, `src/state/dirs.ts`).
- **Button.** The shell tab's metadata row draws an **Open transcript** button (class `tab-open-transcript`, the regular-weight clipboard icon `viewCaptureIcon`, tooltip and accessible name `Open transcript`) once the transcript file has opened — in practice as the shell starts (`web/src/plugins/shell/ShellTabMeta.tsx`, drawn when `capabilities.openTranscript` is present). It sits among the row's actions after the **Show diff in the workspace** button (drawn only on a workspaced shell) and before the connections window button. Pressing it opens the file as it stands in an editor tab named `transcript <label>` (`openTranscriptFileFor`, `src/controller/transcript.ts`). Under `recordShellTabs: false` it is never drawn. Once drawn it stays after a failure and opens whatever was written. A docked shell's button works too.

## Decisions for this subplan

1. **Correct the existing sudo/psql claim everywhere it appears.** `HarnessRecorder` (`src/harness/recorder.ts`) writes only `'o'` (output), `'r'` (resize) and `'x'` (exit) events — never input. A `sudo`, `ssh` or `psql` password prompt turns echo off, so nothing of the password is printed and nothing reaches the recording. The sentences claiming otherwise are inaccurate and would contradict decision 4 side by side. Correct each to the same terms as decision 4 (a command-line secret or a program's echo reaches the file; an echo-disabled prompt prints nothing): `product/specs/shell-tab.md` § Session recording (the sentence ending "so a password typed at a `sudo` or `psql` prompt reaches the recording"), `product/specs/application-config.md` `recordShellTabs` row ("so a password entered at a `sudo` or `psql` prompt lands in the file"), and `documentation/user-documentation/advanced-agents/harness.md` § Recordings ("so a password entered at a `sudo` or `psql` prompt is in the recording"). Keep the surrounding point that a shell, unlike a harness or ssh tab, echoes what is typed.
2. **The `application-config.md` `recordShellTabs` row edit is in scope.** Source decision 9 makes the setting gate the transcript too.
3. **`help.md` gets one row change.** Its **Shell tab controls** table row `` | `Cmd+F` | Does nothing — a shell tab has no transcript to search | `` (`help.md:106`) contradicts the new feature the same way the spec's `Cmd+F` sentence does; reword it. `help.md` describes no metadata-row control and does not mention `recordShellTabs`, so nothing else there changes. No test pins that row's text; the alphabetical-order test in `src/commands.test.ts` covers only the **Commands** table.
4. **`product/specs/notifications.md` gets the new kind.** Subplan 03 added `shell-transcript-failed` to `NotificationEventType`, `EXPLICIT_EVENTS` and the sound categories with no spec text; the event catalog lists every other kind, so it gains a bullet, and the desktop-alert list gains it.
5. **Two more user pages describe `recordShellTabs` and are updated so they stay true:** `documentation/user-documentation/advanced-agents/harness.md` (the paragraph beginning "To decline that for shell tabs") and `documentation/user-documentation/tab-types/recording-player.md` § Turning shell recording off.
6. **User-doc prose follows `ai/guidelines/human-writing-guidelines.md`**: no em dashes in new user-doc prose, short sentences, contractions, second person. Specs keep their existing house style. No code paths, function or class names in user docs (`ai/guidelines/user-documentation.md`, "No implementation leakage"). Do not add, move or remove agent sprites (`ai/guidelines/documentation.md`); `command-bar/shell.md` has none today and that is left alone.
7. **Pre-existing inaccuracies not caused by this feature stay out of scope** and are reported, not fixed: `getting-started/tabs.md:74` "Shell tabs don't show the 📁 button" (the shell row does draw `tab-open-files`), `tab-types/editor.md:127` "In a shell tab, `Cmd+F` still opens that tab's own transcript search" (the spec says it does nothing), `harness-recording.md:62-63` "there is no flag, command, or setting" (contradicted by `recordShellTabs`), and the `.janissary/` directory list in `ai/tasks/workspace/start-application.md:46`, which lacks `shell-transcripts/`.

## Existing documents to edit

| Piece | Where (verify the anchor by grep; line numbers drift) | Use |
| --- | --- | --- |
| Intro, "the terminal where the transcript would be" | `product/specs/shell-tab.md:3` | Unchanged: it means the in-tab transcript, the same sense as the reworded `Cmd+F` sentence |
| `Cmd+F` sentence ("a plugin tab has no transcript to search") | `product/specs/shell-tab.md:189` | Reworded |
| § The metadata row, and the recording-flag paragraph ("It also carries the **recording** flag") | `product/specs/shell-tab.md:210`, `:224` | New button paragraph after the recording-flag paragraph |
| "There is no **open transcript** control, because there is no transcript: the terminal replaced it." | `product/specs/shell-tab.md:264` | That sentence rewritten; the rest of its paragraph (working directory) unchanged |
| § Session recording | `product/specs/shell-tab.md:398` | sudo/psql sentence corrected (decision 1); new § Text transcript follows it |
| `recordShellTabs` paragraph ("Shell recording can be declined.") | `product/specs/harness-recording.md:71` | Cross-reference sentence |
| `recordShellTabs` row | `product/specs/application-config.md:12` | Transcript gate added, sudo/psql corrected |
| `shell-recording-failed` bullet; desktop-alert list ("the three recording-failed events") | `product/specs/notifications.md:171`, `:334` | New bullet; list entry |
| `Cmd+F` row in **Shell tab controls** | `help.md:106` | Reworded |
| § Open a shell tab | `documentation/user-documentation/command-bar/shell.md:3` | New section after it |
| "Harness tabs carry the same 📋 button" paragraph | `documentation/user-documentation/getting-started/tabs.md:79` | Shell sentence added |
| § Recordings sudo/psql paragraph and "To decline that for shell tabs" paragraph | `documentation/user-documentation/advanced-agents/harness.md:258`, `:260` | Corrected; transcript added to the opt-out |
| § Turning shell recording off | `documentation/user-documentation/tab-types/recording-player.md` (`"recordShellTabs": false` block) | Transcript added to the opt-out |

## Proposed changes

### Specs

- `product/specs/shell-tab.md`:
  - New `## Text transcript` section immediately after § Session recording and before § Everything else, carrying every bullet of "Shipped behavior the documents must state" except the button (which goes in § The metadata row) and the code identifiers (a spec may name `.janissary/shell-transcripts/` and the notification text, but describes behavior, not class names). State decision 4 in the same terms the corrected § Session recording uses. Link the recording section and `[[harness-recording]]` the way § Session recording links it. Say plainly the transcript is a separate file from the recording and from the harness session transcript in `.janissary/harness-transcripts/`, and that either can fail without stopping the other.
  - § The metadata row: a new paragraph after the recording-flag paragraph describing the **Open transcript** button as in the Button bullet above: clipboard icon, tooltip `Open transcript`, its position, drawn once the transcript file has opened (in practice as the shell starts), opening the file as it stands in an editor tab `transcript <label>`, staying after a failure, absent under `recordShellTabs: false`.
  - Replace the sentence at `:264` with one saying the terminal takes the place of an in-tab transcript, and the session's text is kept in a file opened with **Open transcript** (see § Text transcript).
  - Reword the `Cmd+F` sentence at `:189` so it remains true: `Cmd+F` does nothing here because the terminal is not a searchable in-tab transcript, the same in every plugin tab; the text transcript, once opened with **Open transcript**, is searched in its editor tab.
  - Correct § Session recording per decision 1: a command line typed at the prompt, or text an interactive program echoes, reaches the recording; a password typed at a prompt that turns echo off (`sudo`, `ssh`, `psql`) prints nothing, so nothing of it is recorded. Keep "This is a real difference from a harness or ssh tab" and the mitigations sentence.
- `product/specs/harness-recording.md` — append to the "Shell recording can be declined." paragraph one sentence: the same setting also turns off the shell tab's plain-text transcript under `.janissary/shell-transcripts/` (see [[shell-tab]] § Text transcript), which is neither a recording nor the harness session transcript this spec describes.
- `product/specs/application-config.md` — the `recordShellTabs` row: say it also gates the shell text transcript under `.janissary/shell-transcripts/` (see `shell-tab.md` § Text transcript), so with it off no shell tab writes either file or draws the recording flag or the **Open transcript** button; replace the sudo/psql clause per decision 1 (the exposure is a secret typed on a command line or echoed by a program).
- `product/specs/notifications.md` — after the `shell-recording-failed` bullet, a `shell-transcript-failed` bullet in the same shape: the line reads `shell transcript failed`, recorded at most once per open tab, nothing for a failure surfacing after the tab closed, a later tab reusing the label reported afresh, fires even while that tab is the active one, leaves the shell and its recording running; the **Open transcript** button, when drawn, still opens what was written (see [[shell-tab]]). In § Desktop alerts and bell sounds, change "the three recording-failed events," to also name `shell-transcript-failed`.

### `help.md`

- The `Cmd+F` row under **Shell tab controls** reads that it does nothing because the terminal has no in-tab transcript to search, and that **Open transcript** opens the session's text transcript in an editor tab, where `Cmd+F` searches it.

### User documentation

- `documentation/user-documentation/command-bar/shell.md` — a new `## Read a shell session's transcript` section directly after § Open a shell tab. Lead with the action (press the 📋 **Open transcript** button in the shell tab's metadata row to open everything the shell has shown so far in an editor tab), then: the file lives at `.janissary/shell-transcripts/<name>-<timestamp>.txt` beside the tab's recording; it holds the prompts, the commands you typed and their output as plain text; full-screen programs such as `vim` and application replies such as `help` aren't in it; a secret typed on a command line is in it, a password typed at a prompt that hides your typing isn't; files are kept across `janus --relaunch` and cleared at a normal launch; `"recordShellTabs": false` in `.janissary/config.json` turns it off along with the recording; if writing fails, the notifications feed shows `shell transcript failed` and the shell keeps running. No em dashes, no code identifiers.
- `documentation/user-documentation/getting-started/tabs.md` — in the paragraph at `:79`, add that shell tabs carry the 📋 button too, and that it opens the shell's text transcript (link to the new `command-bar/shell` section anchor).
- `documentation/user-documentation/advanced-agents/harness.md` — correct the `:258` paragraph per decision 1, and in the `:260` paragraph say shell tabs then also write no text transcript and show no **Open transcript** button.
- `documentation/user-documentation/tab-types/recording-player.md` — in § Turning shell recording off, one sentence that the setting also turns off the shell tab's text transcript, linking the new shell section.

## Tests

None new; documentation only. All earlier subplans' tests remain green.

## Verification

### Automated

- `./scripts/run.mjs check-diff` — green over the working tree.
- `help.md` is parsed at runtime by `src/help-sections.ts`; after editing its row, run `npx vitest run src/commands.test.ts src/help-sections.test.ts` so a broken table is caught even if `check-diff` selects no server tests for a Markdown-only diff.
- `npm run docs:build` is not run; the human runs it with `npm run check`. Check every new internal link by hand against an existing heading.
- `npm run check` is left for the human, once.

### Manual end-to-end in the sandbox

Execute as far as the sandbox allows, following `ai/tasks/workspace/start-application.md` (its "Janissary, specifically" section) and `ai/guidelines/sandbox-e2e-browser.md`. Use scratch root `./temp/shell-transcript-e2e/` with `<work>` = its absolute `work/` directory as the project directory. Every step's evidence lives under the scratch root (gitignored); delete it at the end through `ai/tasks/workspace/stop-application.md`.

Facts that shape the run: `npm run build` first (`web/dist/index.html` is required); start with `node bin/janus.mjs --no-open <work>` (add `--relaunch` for the relaunch step); stop with `node bin/janus.mjs stop <work>`; the app exits about a second after its last browser client disconnects, so **each browser batch is one `./scripts/run.mjs e2e-driver <driver.mjs> --log <work>/.janissary/log/server.log --scratch <scratch> --out <name>` run**, and a later batch needs a fresh start. The driver is a scratch `.mjs` under the scratch root. Scope DOM queries to `.tab-body:visible`. A fresh start's own `janus` launch shell immediately writes a new `janus-<timestamp>.txt`, so "cleared" means the earlier files are gone, not that the directory is empty.

1. **Batch A (fresh start, browser).** Open a named unsandboxed shell from the `janus` tab: `shell tx --no-workspace`. In `tx` submit `ls` and `echo hello`. Wait for `.tab-open-transcript` in the visible tab and record its `title` (`Open transcript`) and that it sits after any `.tab-open-diff` and before `.tab-connections`. Click it; confirm an editor tab `transcript tx` opens whose text holds the `> ` prompts, `ls`, `echo hello` and `hello`, and no `\x1b`. Close that editor tab.
2. Still in batch A: in `tx` submit `vim`, press `Shift+Tab` to focus the terminal, type `:q` and Return, press `Shift+Tab` back to the command bar, submit `echo after-vim`. Press **Open transcript** again; confirm `after-vim` is present and none of vim's screen (its `~` filler rows, its status line) is. Also read the newest `<work>/.janissary/shell-transcripts/tx-*.txt` from disk and confirm the same.
3. Still in batch A: submit `close` in `tx`. Read `tx-*.txt` and confirm its last line is the trailing prompt (`>`), flushed on close. Confirm a `tx-*.cast` exists beside it under `.janissary/recordings/` with a similar but not necessarily identical timestamp. End the batch; once the app has exited, confirm `janus-*.txt` also ends with its prompt (the shutdown wait).
4. **Relaunch (no browser needed).** `node bin/janus.mjs --no-open --relaunch <work>`; confirm the batch-A `tx-*.txt` and `janus-*.txt` are still present; stop the app.
5. **Fresh start (no browser needed).** `node bin/janus.mjs --no-open <work>`; confirm the batch-A files are gone (only a new `janus-*.txt`, if any, remains); stop the app.
6. **Opt-out (browser).** With the Write tool, set `"recordShellTabs": false` in `<work>/.janissary/config.json`, keeping any keys already there. Fresh start; in a batch, open `shell off --no-workspace`, submit `echo off`, and confirm no `.tab-open-transcript` and no recording flag are drawn in the visible tab. After the batch, confirm `<work>/.janissary/shell-transcripts/` does not exist and no `off-*.cast` was written.

**If the browser cannot be driven** (`JANISSARY_BROWSER_WS_ENDPOINT` unset, `e2e browser will not be restarted`, or the driver failing for a reason outside the feature): still run steps 4–5 and the disk half of step 6, using the `janus` launch shell's own `janus-*.txt` as the file under test (its zsh starts and prints a prompt without a browser; if no file appears without one, record that). Record steps 1–3 and the button half of step 6 as **not performed**, with the reason, and name the automated coverage that stands in for them: `src/shell/transcript/writer.test.ts` (escape-free rows, prompts and output, alternate screen absent, carriage-return redraws, unfinished row flushed on exit and dispose), `src/shell/transcript/manager.test.ts` (path set on open, release on close and exit, once-per-tab notice), `src/controller/transcript.test.ts` (shell branch of `openTranscriptFileFor`), `src/tab/manager.test.ts` (installed beside the recorder, neither under `recordShellTabs: false`), `src/state/dirs.test.ts` (cleared fresh, kept on relaunch), `web/src/plugins/api.test.ts` and `web/src/plugins/shell/ShellTabMeta.test.tsx` (button drawn only with `openTranscript`, title, press). Remote shells are not exercised in the sandbox in either case; they share the gate and the writer covered above.

**Reporting.** Report each step as passed, failed (with the observed evidence) or not performed (with the reason). A failing step is a finding for the orchestrator: do not change code in this subplan, and do not soften the documentation to match a bug.

## Out of scope

- Any code change; subplans 01–07 and the repair plans.
- Making the transcript available to the launcher ACP summarizer (source out-of-scope).
- Filtering echoed input or secrets (decision 4); a total size cap or rotation (decision 7); separators, timestamps or exit statuses (decision 3); alternate-screen content (decision 6) and application command replies (decision 13); reflecting later redraws (decision 5).
- The pre-existing documentation inaccuracies listed in decision 7 of this subplan.
- Moving the source plan to `product/plans/complete/` and closing the backlog entry; done by whoever completes the feature.
