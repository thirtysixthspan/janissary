# Shell tab text transcript 08: specs, user documentation, and end-to-end verification

**Complexity: 2/10** — prose edits to two specs and the user documentation, followed by the source plan's full manual end-to-end pass over the integrated feature; no code.

## Goal

Make the specs and user documentation describe the shipped behavior, and verify the whole feature end to end in the running app, including the relaunch lifecycle and the `recordShellTabs: false` opt-out. This is the integration gate for subplans 01–07.

Source plan: implementation-order step 9, the "Specs and documentation" section, and the "Verification" section.

## Design decisions carried from the source plan

The spec text carries decisions **2–7 and 9–13** as the user-facing behavior; decision **8** is the metadata-row button. Decision **4** must be stated plainly: input is persisted as the terminal echoed it — a secret on a command line or echoed by an interactive program lands in the transcript; a secret typed at a prompt that disables echo prints nothing, so nothing of it reaches the file; the mitigations are the recording's (under the project's own `.janissary/`, never served over the network or handed to a client except when the user presses **Open transcript**, cleared at the next fresh launch); `recordShellTabs: false` is the opt-out.

## Dependencies

Subplans 01–07 (the feature must be complete for the documentation to be true and for the end-to-end pass to run).

## Existing code and documents to reuse

| Piece | Where | Use |
| --- | --- | --- |
| § Session recording | `product/specs/shell-tab.md:398` | The new "Text transcript" section sits beside it and uses the same terms for input persistence |
| § The metadata row | `product/specs/shell-tab.md:210` | Gains the button |
| "There is no **open transcript** control, because there is no transcript" | `product/specs/shell-tab.md:264` | Rewritten |
| `Cmd+F` sentence ("a plugin tab has no transcript to search") | `product/specs/shell-tab.md:189` | Reworded so it does not contradict the new section |
| Shell recording and `recordShellTabs` paragraphs | `product/specs/harness-recording.md:68-82` | Cross-reference added |
| `recordShellTabs` config row | `product/specs/application-config.md:12` | Checked for contradiction (see below) |
| Shell tab user pages | `documentation/user-documentation/command-bar/shell.md` (§ Open a shell tab), `documentation/user-documentation/getting-started/tabs.md` (metadata-row paragraph, line 74) | Gain the transcript and button |
| Documentation conventions | `ai/guidelines/user-documentation.md`, `ai/guidelines/documentation.md`, `ai/guidelines/human-writing-guidelines.md` | Style |

## Proposed changes

### Specs

- `product/specs/shell-tab.md`:
  - New "Text transcript" section beside § Session recording, carrying: one `.txt` file per shell session under `.janissary/shell-transcripts/`, named `<label>-<timestamp>.txt` sharing its stem with the recording, created lazily on first output (decision 2); full normal-screen text including prompts and typed command lines, with no separators, timestamps or annotations (decision 3); input persisted as echoed, with the consequence stated in the same terms § Session recording uses (decision 4); rows written once, when the cursor first moves below them, at the then-current width, never revisited, `clear` removing nothing already written, a carriage-return-redrawn row written once in final form (decision 5); alternate-screen programs leave nothing (decision 6); no file size cap, only the 4 MiB in-memory pending limit, after which the transcript stops for the session (decision 7); cleared at a fresh launch, preserved across `--relaunch`, nothing written under `recordShellTabs: false` (decision 9); a failure records one `shell transcript failed` line in the notifications feed and leaves the shell and the recording unaffected (decision 10); the unfinished row is flushed when the tab closes or zsh exits (decision 11); remote shells and siblings get a transcript written locally on the same terms (decision 12); application command replies are drawn by the browser and never reach the transcript (decision 13). Note that, like the recording, a `!`-started PTY is not transcribed.
  - § The metadata row — the **Open transcript** button (clipboard icon, tooltip `Open transcript`, after the split control and before the connections button), opening the file as it stands in an editor tab `transcript <label>`, and absent under `recordShellTabs: false` (decision 8).
  - Rewrite "There is no **open transcript** control, because there is no transcript: the terminal replaced it." so it describes the button and the text transcript instead.
  - Reword the `Cmd+F` sentence so it remains true (the file is not searchable in-tab) without saying the tab has no transcript — for example, that the tab's terminal has no in-tab transcript to search, and the text transcript is opened with **Open transcript**.
  - Reconciliation note for the writer: § Session recording currently says a password typed at a `sudo` or `psql` prompt reaches the recording, while decision 4 says a no-echo prompt prints nothing. The new section states decision 4 as the source plan gives it for the transcript; do not alter the source plan's decision. Whether § Session recording's existing sentence needs correcting is outside this feature — raise it with the user rather than silently changing the recording's documented behavior.
- `product/specs/harness-recording.md` — a cross-reference in the shell-recording paragraphs noting shell tabs also write a text transcript under `.janissary/shell-transcripts/`, gated by `recordShellTabs` (see `shell-tab.md` § Text transcript).
- `product/specs/application-config.md` — the `recordShellTabs` row says the setting controls asciicast recording only; add that it also gates the shell text transcript, so the spec does not contradict decision 9. (This keeps specs consistent; the source plan's spec list does not name this file, so it is the minimal consistency edit.)

### User documentation

- `documentation/user-documentation/command-bar/shell.md` — the shell tab page gains a short description of the text transcript (where it is written, what it contains including typed commands, the relaunch/fresh-launch lifecycle, the `recordShellTabs: false` opt-out) and the **Open transcript** button.
- `documentation/user-documentation/getting-started/tabs.md` — the metadata-row paragraph mentions the shell tab's clipboard **Open transcript** button alongside the existing harness behavior.

## Tests

None new; documentation only. All earlier subplans' tests remain green.

## Verification

- `./scripts/run.mjs check-diff` — green over the whole working tree.
- `npm run docs:build` is not required; if the docs site is touched in a way that could break links, the human runs it with `npm run check`.
- Manual end-to-end (the source plan's Verification section, run against the integrated feature):
  1. Launch the app. In a shell tab run `ls` and `echo hello`. Press **Open transcript** and confirm the editor tab `transcript <label>` shows the prompts, both commands and their output with no escape sequences.
  2. Run `vim`, quit it, and confirm none of its screen appears in the transcript (reopen it with **Open transcript**).
  3. Close the tab and read the newest file under `.janissary/shell-transcripts/`; confirm the trailing prompt row was flushed.
  4. Relaunch with `--relaunch` and confirm the file survives; relaunch fresh and confirm the directory is cleared.
  5. Set `"recordShellTabs": false` in `.janissary/config.json`, relaunch fresh, open a shell tab, run a command, and confirm no file is written under `.janissary/shell-transcripts/` and the **Open transcript** button is not drawn.
- `npm run check` is left for the human, once, after all subplans land.

## Out of scope

- Any code change — subplans 01–07.
- Making the transcript available to the launcher ACP summarizer — a separate feature (source out-of-scope).
- Filtering echoed input or secrets (decision 4); a total size cap or rotation (decision 7); separators, timestamps or exit statuses (decision 3); alternate-screen content (decision 6) and application command replies (decision 13); reflecting later redraws (decision 5).
- Moving the source plan to `product/plans/complete/` and closing the backlog entry — done by whoever completes the feature.
