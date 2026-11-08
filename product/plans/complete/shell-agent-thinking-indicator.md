# Shell agent thinking indicator

**Complexity: 5/10** — spans server and client with no new message, but adds the shell's first interactive, state-changing decoration on terminal rows, an echo-to-reply correlation id, and record-id plumbing through model fallback, with two touched files at the 200-line limit needing extractions.

In a shell tab, accepted `ask <prompt>` and `tell <prompt>` commands keep their ordinary echoed text and gain a `Thinking` decoration with a spinner. Clicking either opens the role's live connection tab. When settlement has a record, the decoration becomes a `see thought process` link to that record; a refusal or any settlement without a record removes it.

When a user types `ask …` or `tell …` in a shell tab today, the shell echoes the line and then shows nothing until the settled Markdown answer arrives, which can take a long time. The only sign that the agent is working is the tab's blinking status dot. The agent's thinking and tool steps are recorded in the role's connection tab, but nothing in the shell points there. This feature marks the echoed line as in progress with a `Thinking` label and a spinner, makes that marker open the connection tab, and swaps the marker for a `see thought process` link once the prompt settles, so the reasoning behind any answer in the scrollback is one click away.

## Design decisions

### Scope

- The feature applies to the shell tab's core ACP commands, `ask <prompt>` and `tell <prompt>` (`product/specs/acp.md` § Commands), in local and remote shell tabs alike. A remote shell's ACP records are kept locally (`acp.md` § Remote connections), so both behave the same.
- `ask reset` and `tell reset` get no marker. Their echo and reply stay exactly as today.

### While the prompt runs

- The echo is the one the shell already writes: the exact typed line, written as soon as the application accepts it (`product/specs/shell-tab.md` § Core ACP connections). The marker is added to that echo; the echo's text is unchanged.
- While the prompt runs, the echo reads `> <command and params> Thinking <spinner>`. `Thinking` is capitalized and carries no ellipsis. The marker carries nothing else: no elapsed time, no model name, no activity kind.
- Clicking `Thinking` or the spinner opens or focuses the connection tab of the prompt's role's live session, the connection tab described in `product/specs/connections-tab.md` § The connection tab, which already shows the prompt's thought, tool, plan, and permission activity. It opens on its newest history, exactly as it opens from the shell's connections window today, so the running prompt is the block in view.
- If the prompt falls back to another model while it runs, `Thinking` follows the role's live session, so a click after the fallback opens the new model's record.
- A click before the role's record exists (the brief moment before the first handshake records the prompt) does nothing, the same silent no-op the record opener gives a live reference with no record today (`src/controller/connection-records.ts`).

### Once the prompt settles

- The marker is replaced by a link reading `see thought process`. It is styled as a link and shows no literal square brackets.
- The link is pinned to the durable record that holds this prompt's final block, the record that answered. It keeps opening that record after a reset, after a model fallback started a newer record, and after the session closed. When every model failed, it targets the final attempt's record if that attempt created one. If the last model fails before its handshake creates a record, the result has no `recordId` and the marker is removed, even when an earlier attempt created a record.
- Clicking the link opens or focuses that record's connection tab at its newest history, exactly as opening the record from the connections list does. It does not scroll to this prompt's block.
- An answer, an `ACP error: …`, `ACP: prompt cancelled.`, and `ACP session closed.` all leave a prompt block in their attempt's record (`product/specs/acp-records.md`), so each gets the link when the final attempt has a record.
- A refusal creates no block, so its marker is removed with nothing in its place. That covers `ACP: a prompt is already running.`, `ACP: the <role> role lists no models.`, a usage line, and any other settlement with no block.
- The settled reply's placement rules stay as they are: beneath the echo when nothing else reached the terminal since, otherwise beneath a second echo at the bottom (`shell-tab.md` § Core ACP connections). A `tell` reply carries its exact line just like an `ask` reply, so it and `tell reset` are placed beneath their own echoes rather than a `> monitor` line.
- Every echo of the line carries the link. When the reply continues beneath the original echo, that echo's marker turns into the link in place. When the reply is written beneath a second echo, the original echo's marker turns into the link and the second echo carries the same link.
- A reply that reaches the tab before its echo (the shell then skips the echo, `ReplyPlacement.echo`) gets no marker or link. Only a refusal settles that fast in practice, and a refusal has no link anyway. If a block-bearing reply ever did, it would read as today; giving it a link would mean creating an entry from the reply alone.

### Edge cases

- Clicking the link after its record is gone (deleted from the connections list, or pruned at startup 30 days after closing, `connections-tab.md`) does nothing, the same silent no-op the record opener already gives a missing record. The link stays in the scrollback.
- A re-attached terminal starts with an empty screen (`shell-tab.md`: "A re-attached terminal starts with an empty screen and shows the shell's output from that point on."), so an echo and its marker do not survive a reload, dock, or undock.
- An `ask` and a `tell` running at once each have their own echo, marker, and link, for their own role.
- The same line typed twice, with the second refused while the first runs, settles each echo's own marker: the refused one is removed and the running one keeps thinking. Echoes are matched to replies by an id, never by line text.
- `tell` and `tell reset` replies carry their exact command line and land beneath their own echoes. `tell reset` still gets no marker. The `ACP_INPUT` matcher accepts `ask` and `tell` as whole words (with optional leading whitespace and slash), case-insensitively; it also accepts command suffixes such as `tell-extra`, but not `telling`, `asked`, or `monitor ask`.

## What already exists (reuse, don't rebuild)

| What | Where | Reuse |
| --- | --- | --- |
| Echo of an ACP command line | `useShellSubmit` in `web/src/plugins/shell/useShellSubmit.ts` (`if (result.coreResponse) echoCommand(text)`), `writeShellEcho` in `web/src/plugins/shell/write-shell-reply.ts`, `formatEchoedCommand` in `format-dispatched-command.ts` | The moment and the line the marker attaches to |
| Reply placement | `ReplyPlacement` in `web/src/plugins/shell/reply-placement.ts` | Decides whether the reply continues beneath its echo, repeats its line, or the echo is skipped; unchanged |
| Reply writing | `writeShellReply` in `write-shell-reply.ts`, `insertMarkdownBlock` in `markdown-block.ts`, `commandHead` in `shell-prompt.ts` | Where a reply's own command line is written, which a second echo's link attaches to |
| HTML anchored to a scrollback row | `insertMarkdownBlock` in `markdown-block.ts`: `registerMarker`, `registerDecoration`, `onRender`, and its `position` helper that hides the block outside the normal buffer | The pattern the marker's decoration follows, including hiding while a full-screen program holds the terminal |
| Command dispatch result | `ShellDispatchResult.result` in `src/plugins/shell/shared.ts`; the `coreResponse` branch of `src/command/manager.ts` (`...(result !== undefined && { result })`) | Carries the reply id from `ask`/`tell` to the shell with no new message |
| Settled reply delivery | `appendAcpBackgroundReply` in `src/acp/response.ts`, `backgroundRepliesFor` in `src/tab/background-replies.ts`, `BackgroundReplyView` in `src/protocol/tab.ts`, `onBackgroundReply` in `web/src/plugins/api.ts`, `useBackgroundReplies` in `web/src/plugins/shell/useBackgroundReplies.ts` | The signal that a prompt settled, extended with its record |
| Answering record per attempt | `AcpPendingPrompt.recordId` in `src/acp/prompt-state.ts`, set by `promptCoreRecord` in `src/acp/record-feed.ts`; one pending prompt per model attempt in `AcpManager.attempt` / `settleAttempt` (`src/acp/manager.ts`) | The final attempt's `recordId`, when it created a record, is the record the result can expose; a refusal never gets one |
| Record naming | `recordConnectionName` in `src/plugins/connections/shared.ts` (`acp:<role>:<ownerName>`); `ownerName` is captured as `tab.title ?? tab.label` by `AcpSessionManager.session()` in `src/acp/session-manager.ts` | The tooltip text |
| Opening a connection tab | `capabilities.openConnection(row)` in `web/src/plugins/plugin-client-capabilities.ts`, sending `openConnectionRecord` with a `recordId` or a tab `acpRef` (`{ scope: 'tab', label, role }`); `openConnectionRecord` in `src/controller/connection-records.ts` | Both clicks, with no new capability or message |
| Spinner | `faSpinner` from `@fortawesome/free-solid-svg-icons` with `spin`, as in `web/src/shared/RemoteSessionButton.tsx` | The spinner glyph |
| Link styling in a reply | `.line.markdown` styles the shell's reply blocks take (`shell.css`, `.shell-output-block`) | The settled link's look |

## Proposed changes

### Server

The server adds optional result and reply metadata. The `ask` and `tell` commands return a dispatch receipt, and granted agents still receive only command output.

- `src/commands/ask.ts` and `src/commands/tell.ts` delegate their shared body to `runAcpCommand` in `src/acp/response.ts`, passing the role. It mints the background reply id with `randomUUID` at dispatch, starts the prompt, and returns `{ replyId, role, name }` as the command result. `name` is `acp:<role>:<tab name>`, where the tab name is `managers.tab.byLabel(label)?.title ?? label`, matching the `tab.title ?? label` captured as `ownerName` by `AcpSessionManager.session()` in `src/acp/session-manager.ts`. The receipt is built before starting the prompt, and each dispatch gets a distinct id, including a refused prompt. The core-response branch of `src/command/manager.ts` already carries that result through both shell dispatch paths: `dispatch` (`dispatchLineWithOutput`) and queued `dispatch-command` (`dispatchQueuedCommand`, `src/plugins/shell/activate.ts`).
- `src/agent/command-tools.ts`: `runGrantedAgentCommand` returns `result.output` for core responses, so a granted agent sees the same empty output as before and never sees the receipt. Other command results keep their existing handling.
- `src/acp/types.ts`: both variants of `AcpPromptResult` gain an optional `recordId`, the record holding the final attempt's prompt block. `settleAcpPrompt` adds only `pending.recordId` after answering the record, without mutating its input result. A refusal creates no record id. If an exhausted final attempt failed before handshake and record creation, it has no id; the implementation does not search earlier attempts.
- `src/acp/response.ts`: `settleAcpPrompt`, the only caller of `pending.finish`, passes `recordId: pending.recordId` on the result when the pending prompt has one. `promptCoreRecord` sets `pending.recordId` only once `records.prompt` added a block, so a refusal, the `Tab not found` settlement, and `noRoleModels` (which call `attempt.onDone` directly in `AcpManager.attempt`) carry none.
- `src/acp/manager.ts` forwards the final attempt's result, including its `recordId`. `finalAttemptResult` in `src/acp/ask-role.ts` rebuilds an exhausted error while preserving that id when present. The exhausted result therefore links to the last attempt's record only if its handshake created one; it does not reuse an earlier attempt's record.
- `src/acp/response.ts`: `appendAcpBackgroundReply` takes the id minted at dispatch rather than minting one at settlement. When the result has a `recordId`, it looks up the row and stores `{ id, name }` as `backgroundRecord`; `name` comes from `recordConnectionName(row)`, so it matches the record's `ownerName` and role. A missing row or missing `recordId` adds no field. `src/tab/types.ts`'s `LogEntry` gains the optional `backgroundRecord` field.
- `src/tab/background-replies.ts`: `ACP_INPUT` matches `tell` as well as `ask` (with the same optional leading slash), so `tell` replies and `tell reset` carry their line and land beneath their own echo. `monitor ask` input still matches neither. `backgroundRepliesFor` copies `backgroundRecord` onto the view as `record`.
- `src/protocol/tab.ts`: `BackgroundReplyView` gains an optional `record: { id: string; name: string }`, and its comment says so.
- `src/plugins/shell/shared.ts` (148 lines): a `ShellAcpReceipt` type (`{ replyId: string; role: 'ask' | 'tell'; name: string }`) and an `isShellAcpReceipt` guard, re-declared there like the module's other shapes and using its own `isRecord`.

### Shell client (`web/src/plugins/shell/`)

- `thinking-marker-decoration.ts` draws a marker as an xterm top-layer decoration. The write callbacks register the marker on the first row of the logical command line, which xterm preserves when narrowing inserts continuation rows or widening removes them; the decoration finds the final wrapped row and places itself after its text. It sizes and positions on each render, hides outside the visible normal buffer or while the alternate buffer is active, and switches between the muted `Thinking` spinner and the `see thought process` link in place. The link and spinner have `role="link"`, title and accessible name `Open <name>`, and pointer interaction; `mousedown` is stopped from reaching xterm. The marker remains decoration-only, so search and copy omit it.
- `write-shell-reply.ts` makes `writeShellEcho` report whether it wrote the echo and, when requested, register a marker in its write-completion callback. `writeShellReply` reports whether it wrote its own command line and can register a marker on that head before writing the body, for either the Markdown block or styled-text fallback path. Marker callbacks run after xterm parses the line, use its first wrapped row so widening does not dispose the marker, and do not register on the alternate buffer.
- `useShellReplyWriters.ts` owns `echoCommand` and `displayReply`, extracted from `useShellTerminal.ts`. Its per-terminal state maps reply ids to marker entries and tracks ids already written. The entry is created before writing the echo because xterm may run the completion callback immediately; if settlement beats the marker callback, that callback draws the settled link or disposes its marker instead of drawing a stale spinner. A reply with a record updates the original echo and any repeated reply echo; a reply without a record removes the marker. Unknown, duplicate, or replayed replies do not invent markers. `useShellTerminal` resets this state on each attach, so a re-attached terminal starts empty.
- `useShellTabTerminal.ts` passes the plugin's own `label` and `openConnection` capability. A running click opens the role's live tab reference; a settled click opens by durable record id. `useShellSubmit.ts` validates the dispatch result with `isShellAcpReceipt` before adding a marker, and `useBackgroundReplies.ts` passes the whole reply to the writer. Both direct `dispatch` and queued `dispatch-command` paths reach the same receipt handling.
- Clicking a running marker calls `openConnection` with `{ text: name, kind: 'acp', acpRef: { scope: 'tab', label: capabilities.label, role } }`. `plugin-client-capabilities.ts` drops an `acpRef` whose label is not this tab's, so the label must be the tab's own. Clicking a link calls it with `{ text: name, kind: 'acp', recordId }`. Neither needs a new capability or message.
- `shell.css` gives the marker muted, normal-weight text, a cell-sized spinner, a pointer cursor, and link styling matching `.line.markdown a`. The spinner keeps its normal app-wide motion behavior; no separate reduced-motion rule was added.

### Documentation

- `product/specs/shell-tab.md` § Core ACP connections and `product/specs/acp.md` § Answers, activity, and questions describe the marker, its link, when each appears, `tell` placement, and the no-link case when an exhausted final attempt never created a record.
- `product/specs/acp.md` § Availability and plugin API and `product/specs/tab-plugins.md` § API version 3 describe the optional `recordId` and `record` fields, including when the final attempt has no record. These fields are additive; API v3 remains current.
- `documentation/developer-documentation/tab-plugins.md` documents the optional result and background-reply fields and the existing `openConnection` capability used by the shell.
- `help/ask.md` and `help/tell.md` explain the running marker, the settled link, and their behavior after reset, model changes, refusal, and session close.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and `documentation/user-documentation/command-bar/shell.md` explain the same behavior in user terms.

## UI design

- **Surface.** The shell tab's xterm terminal, on the bold echoed command line the shell writes for an `ask` or `tell` (`shellCommandLine` in `shell-prompt.ts`). The marker is an HTML decoration anchored to that row, the same mechanism as the rendered Markdown reply blocks (`markdown-block.ts`), because terminal text cannot animate or be swapped once more output follows it.
- **Placement.** Inline, one cell after the command's last character, reading `> <command and params> Thinking <spinner>`. For a line that wraps, that is after the text on its last row. When that row has no room left, the marker sits at the row's right edge over its last cells, drawn on the terminal background so it reads cleanly. The settled link takes the marker's place.
- **Look.** `Thinking` is in the theme's muted text color and not bold, followed by the Font Awesome `faSpinner` icon spinning at the terminal font's size, the spinner `RemoteSessionButton` uses. The settled `see thought process` is styled like a link in a rendered shell reply (`.line.markdown a`), without literal brackets. Both take the terminal theme's colors, so they follow the light and dark themes as reply blocks do.
- **Interaction.** Pointer only. The pointer cursor shows over the marker and the link. A click opens or focuses the connection tab as the current centre tab and gives it focus, exactly as opening a row from the shell's connections window does. The shell's command bar keeps its draft for when the user returns. There is no new key binding or command, so nothing collides with `help/keys.md`; the connection tab stays reachable from the keyboard through `connections` and the shell's connections window.
- **Accessible name and tooltip.** Both the running marker and the link carry `Open acp:<role>:<tab name>`, the connection tab's own title, as their tooltip and accessible name (for example `Open acp:ask:shell`). The running marker's name comes from the dispatch receipt; the link's comes from the answering record.
- **States.** Running shows `Thinking` and the spinner. Settled with a record shows the link. Settled without a record, including a refusal or an exhausted fallback whose final attempt failed before creating a record, shows nothing beyond the echo. While a full-screen program holds the terminal, markers and links hide and reappear when it returns, like reply blocks. They do not depend on how the reply was rendered: an echo above a reply that fell back to styled terminal text still gets its link. A resize re-places them after the echo text reflows. The marker and link are not terminal text, so terminal search does not see them and a terminal selection or copy does not include them.
- **Motion.** The spinner always spins, matching the app's other spinners. Reduced-motion handling is app-wide future work.
- **Code organization.** The client code lives in the shell plugin's own directory, `web/src/plugins/shell/`, per `ai/guidelines/react-code-organization.md`: the marker decisions in the `useShellReplyWriters` hook, the xterm drawing in `thinking-marker-decoration.ts`, wiring in the existing hooks, and no import from another feature. The server owns which record answered a prompt and its name, per `ai/guidelines/architecture-principles.md` §1; the client holds only what it draws.

## Tests

Client (vitest project `client`):

- `web/src/plugins/shell/thinking-marker-decoration.test.ts`: covers cell-accurate placement (including wide and empty cells), full rows, wrapped logical lines, resize, missing rows, viewport and alternate-buffer hiding, in-place state changes, accessible role/name and spinner, click handling, stopped mouse-down propagation, and disposal.
- `web/src/plugins/shell/write-shell-reply.test.ts` and `write-shell-reply.reflow.test.ts`: cover callback timing and first-row marker registration for echoes and repeated reply heads, alternate-buffer behavior, unchanged single-write paths, and real xterm narrowing/widening behavior.
- `web/src/plugins/shell/useShellReplyWriters.test.ts`: covers same-line dispatches settling independently by id, repeated echoes, refusal removal, replies arriving before echoes or before xterm's marker callback, duplicate and unknown ids, per-attach state reset, alternate-buffer behavior, updated connection options, and stable writer identity.
- `web/src/plugins/shell/useBackgroundReplies.test.ts`: the whole reply, `id` and `record` included, reaches `displayReply` as its third argument.
- `web/src/plugins/shell/ShellTab.test.tsx`: exercises the direct and queued dispatch paths, `ask` and `tell`, running-to-settled clicks, saved command-bar drafts, repeated echoes, simultaneous roles, refused and malformed receipts, reset lines without markers, and replies arriving before dispatch results.

Server (vitest project `server`):

- `src/commands/ask.test.ts` and `src/commands/tell.test.ts`: `run` returns `{ replyId, role, name }`, uses the tab title or label, gives each dispatch a distinct id, and the settled background entry's `background` equals that id. Refused prompts settle against their dispatch receipt.
- `src/acp/response.test.ts`: `settleAcpPrompt` passes the pending prompt's `recordId` for answers, errors, cancellation, and session close, without mutating the result; it carries no id when the prompt has none. `appendAcpBackgroundReply` uses the dispatch id, stores `backgroundRecord` from the matching record row, and omits the field when the result or row has no record.
- `src/acp/plugin-session.test.ts` and `src/plugins/shell/shared.test.ts`: exercise the real dispatch receipt and background reply record, and pin `isShellAcpReceipt` against valid and malformed shapes. `src/agent/command-tools.test.ts` ensures granted agents receive core-response output, not the receipt.
- `src/acp/manager-fallback.test.ts` and `src/acp/ask-role.test.ts`: pin the answering attempt's record across fallback and exhausted-result rebuilding, cancellation, and close. If the last model fails before its handshake, the exhausted result has no record id even if an earlier attempt created one.
- `src/tab/background-replies.test.ts`: a `tell` and a `tell reset` reply carry their line, a `monitor ask` reply still does not, and `backgroundRecord` reaches the view as `record`.
- `src/commands.test.ts` and `src/plugins/documentation.test.ts` retain the help-page and developer-reference checks.

## Out of scope

- Streaming the agent's thinking or tool steps into the shell. They stay in the connection tab (`product/specs/acp.md` § Answers, activity, and questions).
- Scrolling the connection tab to the clicked prompt's block, or highlighting it. Both clicks open the tab at its newest history.
- Elapsed time, model name, or current activity in the marker.
- A keyboard path to the marker or link: no new key binding or command.
- A marker on `ask reset`, `tell reset`, or `monitor ask` lines. Only `tell reset`'s placement changes, through the `tell` line fix.
- Tabs other than the shell tab, such as editor or harness surfaces.
- Restoring markers after a reload, dock, or undock: a re-attached terminal starts empty.
- Honoring the OS reduced-motion setting.

## Verification

- `npm run build` passed. The focused server path suites passed 388/388 tests across 17 files and the focused client path suites passed 290/290 across 9 files. After the rebase, `pr-check-gate` passed typecheck and lint (0 errors, 4 warnings) and 15,497 tests passed with 1 skipped; GitHub's TypeScript, lint, and test checks passed on the pushed head.
- `npm run docs:build` failed at the unchanged `documentation/user-documentation/tab-types/roles.md:16:245` with a Vue missing-end-tag parse error. The same file is present on `origin/master`.
- The manual run started the app and shell, ran the `ls` fixture, reached the expected no-model refusals for `ask` and `tell`, confirmed both reset responses, and ran both find queries without marker text matches. The isolated scratch `HOME` had no signed-in answering model, so model-dependent marker states and clicks were not reached and no positive marker screenshot was available. The reload check was partial because the helper selected a hidden tab; the assertion did not establish the post-reload screen state.
