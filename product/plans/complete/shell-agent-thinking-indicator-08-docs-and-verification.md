# Thinking indicator help pages, user docs, and end-to-end verification
**Complexity: 3/10** — four concise documentation edits and a browser walk across running, settled, refused, reset, resized, and reloaded states; the only uncertainty is whether a model is authenticated in the isolated scratch home.

## Goal

Document the `Thinking` marker and the `see thought process` link for the people who use the shell, in the two help pages and the two user documentation pages the source plan names. Then show that the whole feature works in a running app. This is the last subplan and runs after every code, test, and spec change is in.

## Design decisions and dependencies

This subplan depends on `07-client-wiring`, and through it on everything before it, so the pages describe behavior that exists. It edits no source, test, or spec file. The behavior specs (`product/specs/shell-tab.md`, `product/specs/acp.md`) were updated in `03-reply-record-and-tell-line` and `07-client-wiring` with the behavior they make real. The user-facing help and documentation ride here, in the last subplan, because they describe the finished behavior as one piece and not the intermediate states.

Source plan requirements carried here: "Documentation" bullets on `help/ask.md`, `help/tell.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `documentation/user-documentation/command-bar/shell.md`; "Verification" (the diff-scoped check and every manual step); "UI design" Interaction (no keyboard path, so the connection tab stays reachable through `connections` and the shell's connections window); "Out of scope" confirmations.

- Content for all four pages, written in user terms with no file paths, function names, or record ids (`ai/guidelines/user-documentation.md`, "No implementation leakage"), and in the tone of `ai/guidelines/human-writing-guidelines.md` (short sentences, no em dashes):
  - While an `ask` or `tell` runs, the echoed line ends with `Thinking` and a spinning icon. Clicking either opens the connection tab for that conversation, where the agent's thinking and tool steps are shown.
  - When the answer arrives, the marker is replaced by a `see thought process` link that opens the same conversation's connection tab. It keeps working after `ask reset`, `tell reset`, or a model switch, and after the session ends. If the connection has been deleted from the connections list or has expired, clicking it does nothing.
  - A prompt that is refused (for example `ACP: a prompt is already running.`, `ACP: the ask role lists no models.`, or a usage line) loses the marker and gets no link. `ask reset` and `tell reset` never get one.
  - When the reply is printed again at the bottom, both copies of the line carry the link.
  - The marker and link are not text in the terminal, so terminal search does not find them and copying does not include them. They are gone after a reload or after docking or undocking the tab, because the screen starts empty. There is no keyboard shortcut; `connections` and the shell's connections window reach the same tab.
- `help/ask.md` and `help/tell.md`: one or two sentences each, placed with the existing description of the echo and answer (the opening paragraph and the note that says the answer arrives once the prompt settles), saying the above for their role (`ask` or `tell`). Each help page is also read by `src/commands.test.ts`, which checks every command has a page; no page is added or renamed. The docs site generates its command reference from these pages, so the generated copies are not edited (`ai/guidelines/documentation.md`, Help Command Table).
- `documentation/user-documentation/advanced-agents/acp-agent.md`: in the paragraph that describes the echo and the answer (`The command returns to the bar immediately…`), add the marker and link in two or three sentences; the `tell` section needs no separate paragraph beyond a clause saying it behaves the same.
- `documentation/user-documentation/command-bar/shell.md`: the `ask <prompt>` paragraph under the ACP heading gets the same two or three sentences, shorter, and a pointer to the ACP agents page for the detail.
- Keep both user pages in user terms: describe what a person sees and clicks, not record ids, file paths, or implementation names. The marker is pointer-operated; `connections` and the shell's connections window remain the keyboard route. A settled link opens the same retained record after reset, model fallback, or session close; if that record was deleted or pruned, the click does nothing.
- No sprite or image is added or moved. The placement rules for the documentation's decorative sprites (`ai/guidelines/documentation.md`) are not affected by adding sentences to existing paragraphs, but confirm a sentence does not land directly beside a float.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Help pages | `help/ask.md`, `help/tell.md` | Edited. |
| User documentation | `documentation/user-documentation/advanced-agents/acp-agent.md`, `documentation/user-documentation/command-bar/shell.md` | Edited. |
| Help existence test | `src/commands.test.ts` | Must keep passing. |
| Developer doc assertions | `src/plugins/documentation.test.ts` | Must keep passing; it reads capability facts, not these pages. |
| Docs build | `npm run docs:build` (VitePress) | Confirms no dead links or build errors from the edits. |
| Isolated app lifecycle | `ai/tasks/workspace/start-application.md` and `ai/tasks/workspace/stop-application.md` | Start and stop the app in a new scratch project directory with a scratch `HOME`; the start task records the server log path and lock identity. |
| Attached-browser runner | `scripts/e2e-driver.mjs`, invoked through `./scripts/run.mjs e2e-driver`, and `scripts/e2e/session.mjs` | One driver holds one browser connection for the entire walk; a second connection gets a different browser and the app exits when its last client disconnects. |
| Sandboxed browser guide | `ai/guidelines/sandbox-e2e-browser.md` | Use the attached browser and the app started from this checkout; never launch a separate browser or drive a human's live session. |

## Proposed changes

- `help/ask.md`, `help/tell.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, `documentation/user-documentation/command-bar/shell.md`: the edits above. No other file changes.

## Tests

No new test files. The existing `src/commands.test.ts` and `src/plugins/documentation.test.ts` must pass. Because a change made only to Markdown selects nothing under `check-diff`, run the whole feature's tests by path as a final regression pass:

- Server: `npx vitest run --project server src/commands.test.ts src/plugins/documentation.test.ts src/acp/response.test.ts src/acp/ask-role.test.ts src/acp/manager-fallback.test.ts src/acp/manager.test.ts src/acp/plugin-session.test.ts src/commands/ask.test.ts src/commands/tell.test.ts src/commands/ask-reset.test.ts src/commands/tell-reset.test.ts src/agent/command-tools.test.ts src/tab/background-replies.test.ts src/tab/view.test.ts src/plugins/shell/shared.test.ts src/command/manager.test.ts src/controller/connection-records.test.ts`.
- Client: `npx vitest run --project client web/src/plugins/shell/thinking-marker-decoration.test.ts web/src/plugins/shell/write-shell-reply.test.ts web/src/plugins/shell/useShellReplyWriters.test.ts web/src/plugins/shell/useShellTerminal.test.ts web/src/plugins/shell/useShellTerminal.press-focus.test.ts web/src/plugins/shell/useBackgroundReplies.test.ts web/src/plugins/shell/ShellTab.test.tsx web/src/plugins/shell/shell-style.test.ts web/src/plugins/shell/markdown-block.test.ts`.

## Verification

Pass criteria:

- `$janissary/scripts/run.mjs check-diff` exits 0 in the form that applies. A Markdown-only change runs nothing under it, and a clean tree prints `check:diff: no changes`, so an exit status of 0 is not a pass by itself. If the feature is uncommitted, run it and report that; if it is committed, run `npm run typecheck:diff` and the by-path test runs above and report which form ran. The full `npm run check` stays the human's end-of-work gate and is not run here.
- `npm run docs:build` finishes without errors.
- Every manual step below produces its stated result.
- A defect against any criterion is recorded against the subplan that owns the behavior: `01` or `03` for a wrong record or a missing link, `02` for the receipt or the agent output, `04` for how the marker draws, `05` or `06` for where it goes and how it settles, `07` for the wiring, and this subplan for the wording of a page.

Manual walk. Start the app with `ai/tasks/workspace/start-application.md`, using a new scratch root such as `./temp/shell-agent-thinking-indicator-e2e/`; it creates a scratch project directory and scratch `HOME`, builds this checkout, and records the server log. Create `notes.txt` with exactly `hello` in the scratch project directory. Write one driver under `./temp/shell-agent-thinking-indicator-e2e-drivers/feature.mjs` and run it with `./scripts/run.mjs e2e-driver`, pointing `--log` at the recorded project's `.janissary/log/server.log` and `--scratch` at the ignored scratch root. Keep that single browser connection open across every step; the app exits after its last browser client disconnects. Stop the instance with `ai/tasks/workspace/stop-application.md` when the walk ends. Do not put the token-gated URL or browser endpoint in the driver, its output, or the report.

The successful answer and tell-reply checks need at least one enabled, signed-in model for each role in the scratch `HOME`. If none is available, record the affected model-dependent steps as not reached and cite the unit tests that cover them; do not count a refusal or exhausted-model error as a successful answer. Model fallback cannot be forced by hand; `01-acp-result-record-id` and `06-marker-lifecycle` cover its record choice.

1. In the app's first tab, run `shell --no-workspace`. In the shell command bar, run `ask write a detailed essay of about 1200 words on the history of the printing press`. The echo shows muted `Thinking` and a spinning icon, with the accessible name and hover text `Open acp:ask:<tab name>`. Hover over both `Thinking` and the spinner. Type `draft text` in the shell command bar and click `Thinking`; the ask connection tab becomes the current centre tab with the running prompt in view. Return to the shell tab; the command bar still contains `draft text`. Click the spinner; it opens the same connection tab.
2. Wait for the ask to settle. The echoed line now has a link reading `see thought process`, without brackets. Click it; the same answering record opens at its newest history. The answer is rendered beneath the echo.
3. Return to the shell. Run `tell write a detailed essay of about 1200 words on the history of the telescope`, then immediately run `ls`. The terminal lists `notes.txt`. When tell settles, its answer is beneath a second `> tell …` echo rather than a `> monitor` line, and both echoes carry the `see thought process` link.
4. Wait for both roles to be idle. Submit `ask write a detailed essay of about 1200 words on the history of the clock` twice in quick succession. The second echo is followed by `ACP: a prompt is already running.` and has no marker or link. The first echo keeps `Thinking` and later becomes a link.
5. Run `ask reset` and `tell reset`. Neither echo has a marker. Each exact confirmation appears beneath its own reset echo.
6. Start another long `ask`, then run `vim` before it settles. If `vim` is unavailable, run `less notes.txt` instead. While the full-screen program holds the terminal, the marker is hidden. After quitting with `:q` and Enter in vim, or `q` in less, the marker is visible again in its running or settled state.
7. Start another long `ask` and set the browser viewport width to 480 px. Its echo wraps, and the marker appears on the echo's final row, after its text or at that row's right edge if no cells remain. Restore the original viewport width; the marker returns to one cell after the text.
8. After an ask has settled, run `ask reset`, open `connections`, and delete that closed ask record with the **Delete** control and its confirmation. Return to the shell and click the old `see thought process` link. The link remains in the scrollback, but nothing opens and no error is printed.
9. Reload the app page in the same driver session and reopen the shell tab. The shell shows output only from after the reload; no old `Thinking`, spinner, or `see thought process` marker remains.
10. In the shell, press `Cmd+F`, type `Thinking`, and confirm the find overlay has no matching row. Press Escape, repeat with `thought process`, and confirm it also has no match. Select an echoed command line, use the terminal context menu's **Copy**, and paste into the command bar. The pasted text contains the command but neither marker phrase.

No manual step forces model fallback or a click before the first connection record exists; the focused tests in subplans 01 and 06 cover those cases. A role with no models and remote shell behavior are not manually exercised; the server tests cover the no-model reply, while remote shell behavior needs a remote host.

Out-of-scope confirmation, by reading the diff: no key binding was added (`help/keys.md` is unchanged), no marker appears on `ask reset`, `tell reset`, or `monitor ask`, no tab other than the shell uses the markers, the connection tab does not scroll to a prompt, and nothing in the marker shows elapsed time, a model name, or an activity.

After the work is complete, the plan files move from `product/plans/draft/` to `product/plans/ready/` and later to `complete/`, as `AGENTS.md` describes. That is the owner's call.

## Out of scope

- Turning the walk into an automated end-to-end suite.
- The full `npm run check` gate.
- Fixing a defect inside this subplan. A defect goes to its owning subplan.
- Any new feature work. Anything beyond this feature that the walk surfaces is logged in `product/backlog/`.
- A user documentation page of its own for the indicator; the two pages named in the source plan are enough.
