# Thinking indicator help pages, user docs, and end-to-end verification
**Complexity: 2/10** — four short documentation edits in user terms, then a manual walk and a by-path test run; no code and no new module, and any defect the walk finds goes back to the subplan that owns it.

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
- No sprite or image is added or moved. The placement rules for the documentation's decorative sprites (`ai/guidelines/documentation.md`) are not affected by adding sentences to existing paragraphs, but confirm a sentence does not land directly beside a float.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Help pages | `help/ask.md`, `help/tell.md` | Edited. |
| User documentation | `documentation/user-documentation/advanced-agents/acp-agent.md`, `documentation/user-documentation/command-bar/shell.md` | Edited. |
| Help existence test | `src/commands.test.ts` | Must keep passing. |
| Developer doc assertions | `src/plugins/documentation.test.ts` | Must keep passing; it reads capability facts, not these pages. |
| Docs build | `npm run docs:build` (VitePress) | Confirms no dead links or build errors from the edits. |
| Launcher and instance lock | `bin/janus.mjs`, `src/instance-lock.ts` (`.janissary/lock`) | How the walk starts and stops a scratch instance. |
| Sandboxed browser guide | `ai/guidelines/sandbox-e2e-browser.md` | Why an agent inside a workspace cannot do the walk itself. |

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

Manual walk. It needs a running app and a browser, so a person or a browser-capable tool does it; an agent inside a workspace sandbox cannot start a browser. Run it in a scratch project directory outside this checkout, started with `node bin/janus.mjs --no-open <scratch-dir>` and stopped with `node bin/janus.mjs stop <scratch-dir>`, opening the printed token-gated URL. One instance runs per directory, so never use a directory where a live session holds `.janissary/lock`, and never delete a lock. The `ask` role needs a model that can answer; with the default roles that is a signed-in harness. If none is available, steps 1 to 4 can still be walked with failure lines, and the steps that need an answer are recorded as not reached.

1. In a shell tab, run `ask what is 2+2`. The echo shows a muted `Thinking` and a spinning icon one cell after the line. Confirm the icon actually turns. Hovering shows `Open acp:ask:<tab name>`. Clicking opens the ask connection tab as the current centre tab with the running prompt in view, and the command bar keeps any draft typed before the click.
2. When the answer arrives beneath the echo, the marker reads `see thought process` in link style with no brackets. Clicking it opens the same record's connection tab.
3. Run `tell list the files here`, then run `ls` before it settles. The `tell` reply lands beneath a second `> tell …` echo, not a `> monitor` echo, and both `tell` echoes carry the link.
4. While a prompt runs, type the same `ask` line again. The second echo's marker disappears with the refusal, and the first keeps thinking.
5. Run `ask reset` and `tell reset`. Neither echo has a marker, and each confirmation lands beneath its own echo.
6. Start an `ask`, open `vim` before it settles, and quit. The marker or link is hidden while `vim` runs and back afterwards.

Also check, beyond the source plan's list but within its edge cases: narrowing the window so an echo wraps keeps the marker after the last character of the line; after the answer, `ask reset` and then deleting that conversation from the connections list leaves the link in the scrollback and clicking it does nothing; reloading the page leaves an empty screen with no markers; transcript search (`Cmd+F`) for `Thinking` or `thought process` finds nothing, and selecting across an echo and copying leaves the marker text out. Record any step that cannot be reached, with the unit test that carries it. A model fallback cannot be forced by hand; `01-acp-result-record-id` and `06-marker-lifecycle` carry it.

Out-of-scope confirmation, by reading the diff: no key binding was added (`help/keys.md` is unchanged), no marker appears on `ask reset`, `tell reset`, or `monitor ask`, no tab other than the shell uses the markers, the connection tab does not scroll to a prompt, and nothing in the marker shows elapsed time, a model name, or an activity.

After the work is complete, the plan files move from `product/plans/draft/` to `product/plans/ready/` and later to `complete/`, as `AGENTS.md` describes. That is the owner's call.

## Out of scope

- Turning the walk into an automated end-to-end suite.
- The full `npm run check` gate.
- Fixing a defect inside this subplan. A defect goes to its owning subplan.
- Any new feature work. Anything beyond this feature that the walk surfaces is logged in `product/backlog/`.
- A user documentation page of its own for the indicator; the two pages named in the source plan are enough.
