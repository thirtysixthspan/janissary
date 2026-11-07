# Shell agent thinking indicator

**Complexity: 5/10** — spans server and client with no new message, but adds the shell's first interactive, state-changing decoration on terminal rows, an echo-to-reply correlation id, and record-id plumbing through model fallback, with two touched files at the 200-line limit needing extractions.

Feature: in a shell tab, when asking or telling an agent to do something, the command should be entered into the transcript
`> <command and params> Thinking <spinner>`
where clicking on the thinking or spinner will open the relevant connection tab to show the thinking of the agent in teh acp connection. once an answer is generated, the thinking and spinner should be removed and replaced with `[see thought process]` similarly linked to the connection.

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
- The link is pinned to the durable record that holds this prompt's final block, the record that answered. It keeps opening that record after a reset, after a model fallback started a newer record, and after the session closed. When every model failed, it is the record of the last model tried.
- Clicking the link opens or focuses that record's connection tab at its newest history, exactly as opening the record from the connections list does. It does not scroll to this prompt's block.
- An answer, an `ACP error: …`, `ACP: prompt cancelled.`, and `ACP session closed.` all leave a prompt block in the record (`product/specs/acp-records.md`), so each gets the link.
- A refusal creates no block, so its marker is removed with nothing in its place. That covers `ACP: a prompt is already running.`, `ACP: the <role> role lists no models.`, a usage line, and any other settlement with no block.
- The settled reply's placement rules stay as they are: beneath the echo when nothing else reached the terminal since, otherwise beneath a second echo at the bottom (`shell-tab.md` § Core ACP connections).
- Every echo of the line carries the link. When the reply continues beneath the original echo, that echo's marker turns into the link in place. When the reply is written beneath a second echo, the original echo's marker turns into the link and the second echo carries the same link.
- A reply that reaches the tab before its echo (the shell then skips the echo, `ReplyPlacement.echo`) gets no marker or link. Only a refusal settles that fast in practice, and a refusal has no link anyway. If a block-bearing reply ever did, it would read as today; giving it a link would mean creating an entry from the reply alone.

### Edge cases

- Clicking the link after its record is gone (deleted from the connections list, or pruned at startup 30 days after closing, `connections-tab.md`) does nothing, the same silent no-op the record opener already gives a missing record. The link stays in the scrollback.
- A re-attached terminal starts with an empty screen (`shell-tab.md`: "A re-attached terminal starts with an empty screen and shows the shell's output from that point on."), so an echo and its marker do not survive a reload, dock, or undock.
- An `ask` and a `tell` running at once each have their own echo, marker, and link, for their own role.
- The same line typed twice, with the second refused while the first runs, settles each echo's own marker: the refused one is removed and the running one keeps thinking. Echoes are matched to replies by an id, never by line text.
- Today a `tell` reply reaches the shell without its command line (`backgroundRepliesFor` attaches a line only to `ask` input), so it is written beneath a `> monitor` echo instead of beneath its own. This feature makes a `tell` reply carry its line the same way an `ask` reply does, so it is placed beneath its own echo and its marker settles. The same fix places `tell reset`'s confirmation beneath its own `> tell reset` echo, as `ask reset`'s already is; that echo still gets no marker.

## What already exists (reuse, don't rebuild)

| What | Where | Reuse |
| --- | --- | --- |
| Echo of an ACP command line | `useShellSubmit` in `web/src/plugins/shell/useShellSubmit.ts` (`if (result.coreResponse) echoCommand(text)`), `writeShellEcho` in `web/src/plugins/shell/write-shell-reply.ts`, `formatEchoedCommand` in `format-dispatched-command.ts` | The moment and the line the marker attaches to |
| Reply placement | `ReplyPlacement` in `web/src/plugins/shell/reply-placement.ts` | Decides whether the reply continues beneath its echo, repeats its line, or the echo is skipped; unchanged |
| Reply writing | `writeShellReply` in `write-shell-reply.ts`, `insertMarkdownBlock` in `markdown-block.ts`, `commandHead` in `shell-prompt.ts` | Where a reply's own command line is written, which a second echo's link attaches to |
| HTML anchored to a scrollback row | `insertMarkdownBlock` in `markdown-block.ts`: `registerMarker`, `registerDecoration`, `onRender`, and its `position` helper that hides the block outside the normal buffer | The pattern the marker's decoration follows, including hiding while a full-screen program holds the terminal |
| Command dispatch result | `ShellDispatchResult.result` in `src/plugins/shell/shared.ts`; the `coreResponse` branch of `src/command/manager.ts` (`...(result !== undefined && { result })`) | Carries the reply id from `ask`/`tell` to the shell with no new message |
| Settled reply delivery | `appendAcpBackgroundReply` in `src/acp/response.ts`, `backgroundRepliesFor` in `src/tab/background-replies.ts`, `BackgroundReplyView` in `src/protocol/tab.ts`, `onBackgroundReply` in `web/src/plugins/api.ts`, `useBackgroundReplies` in `web/src/plugins/shell/useBackgroundReplies.ts` | The signal that a prompt settled, extended with its record |
| Answering record per attempt | `AcpPendingPrompt.recordId` in `src/acp/prompt-state.ts`, set by `promptCoreRecord` in `src/acp/record-feed.ts`; one pending prompt per model attempt in `AcpManager.attempt` / `settleAttempt` (`src/acp/manager.ts`) | The final attempt's `recordId` is the record that answered; a refusal never gets one |
| Record naming | `recordConnectionName` in `src/plugins/connections/shared.ts` (`acp:<role>:<ownerName>`); `ownerName` is captured as `tab.title ?? tab.label` (`src/plugins/connections-topic-rows.ts`) | The tooltip text |
| Opening a connection tab | `capabilities.openConnection(row)` in `web/src/plugins/plugin-client-capabilities.ts`, sending `openConnectionRecord` with a `recordId` or a tab `acpRef` (`{ scope: 'tab', label, role }`); `openConnectionRecord` in `src/controller/connection-records.ts` | Both clicks, with no new capability or message |
| Spinner | `faSpinner` from `@fortawesome/free-solid-svg-icons` with `spin`, as in `web/src/shared/RemoteSessionButton.tsx` | The spinner glyph |
| Link styling in a reply | `.line.markdown` styles the shell's reply blocks take (`shell.css`, `.shell-output-block`) | The settled link's look |

## Proposed changes

### Server

Land the server changes first; each is additive (optional fields, a result the shell ignores until the client lands), so typecheck and tests stay green between the two halves.

- `src/commands/ask.ts` and `src/commands/tell.ts` are identical apart from the role. Replace their shared body with one helper in `src/acp/response.ts` (43 lines today), called with the role. The helper mints the background reply's id with `randomUUID` when the command is dispatched rather than at settlement, starts the prompt exactly as `run` does today, and returns the receipt `{ replyId, role, name }` as the command's result. `name` is `acp:<role>:<tab name>`, where the tab name is `managers.tab.byLabel(label)?.title ?? label`, the same `tab.title ?? tab.label` a new record captures as `ownerName` (`src/plugins/connections-topic-rows.ts`). `run` receives only `{ label, index }` as its tab, so the title must be read from the tab manager. The `coreResponse` branch of `src/command/manager.ts` (`...(result !== undefined && { result })`) already hands that result to both shell dispatch paths: the `dispatch` intent (`dispatchLineWithOutput`) and the queued `dispatch-command` intent (`dispatchQueuedCommand`, `src/plugins/shell/activate.ts`).
- `src/agent/command-tools.ts`: `runGrantedAgentCommand` turns any defined `result` into the tool's output (`JSON.stringify(result.result)`), so an agent granted `ask` or `tell` would start seeing the receipt where it now sees the empty output. Return `result.output` whenever `result.coreResponse` is true. This is the only caller that reads `result`; the launcher (`web/src/plugins/launcher/launcher-actions.ts`, `if (reply.coreResponse || !reply.output) return null`) and the diff and launcher plugins' own `dispatchLineWithOutput` calls already ignore it.
- `src/acp/types.ts`: both variants of `AcpPromptResult` gain an optional `recordId`, the record holding the prompt's final block.
- `src/acp/response.ts`: `settleAcpPrompt`, the only caller of `pending.finish`, passes `recordId: pending.recordId` on the result when the pending prompt has one. `promptCoreRecord` sets `pending.recordId` only once `records.prompt` added a block, so a refusal, the `Tab not found` settlement, and `noRoleModels` (which call `attempt.onDone` directly in `AcpManager.attempt`) carry none.
- `src/acp/manager.ts` is at the 200-line limit (198 counted lines). `settleAttempt` already forwards the final attempt's result, `recordId` included, except when every model failed: then it builds a fresh `{ answered: false, error: exhaustedError(…) }` that would drop it. Move that `attempt.onDone(failed && failures.length > 1 ? … : result)` expression into a helper beside `exhaustedError` in `src/acp/ask-role.ts` (66 lines) that keeps `result.recordId` on the exhausted error, so `manager.ts` does not grow.
- `src/acp/response.ts`: `appendAcpBackgroundReply` takes the id minted at dispatch instead of calling `randomUUID` itself. When the result carries a `recordId`, it looks the record up in `managers.acpRecords.rows()` and stores `{ id, name }` on the log entry beside `background`, with `name` built from the row's `role` and `ownerName` as `acp:<role>:<ownerName>`, the form `recordConnectionName` gives the connection tab its title. A record no longer in the rows (deleted mid-prompt) stores nothing. `src/tab/types.ts`'s `LogEntry` (189 counted lines) gains that one optional field, `backgroundRecord`.
- `src/tab/background-replies.ts`: `ACP_INPUT` matches `tell` as well as `ask` (with the same optional leading slash), so a `tell` reply carries its line. That also places `tell reset`'s reply beneath its own echo, which today lands beneath `> monitor` for the same reason. `monitor ask` input still matches neither. `backgroundRepliesFor` copies `backgroundRecord` onto the view as `record`.
- `src/protocol/tab.ts`: `BackgroundReplyView` gains an optional `record: { id: string; name: string }`, and its comment says so.
- `src/plugins/shell/shared.ts` (148 lines): a `ShellAcpReceipt` type (`{ replyId: string; role: 'ask' | 'tell'; name: string }`) and an `isShellAcpReceipt` guard, re-declared there like the module's other shapes and using its own `isRecord`.

### Shell client (`web/src/plugins/shell/`)

- `thinking-marker-decoration.ts` (new): draws one marker on one echo row as an xterm decoration, following `insertMarkdownBlock` in `markdown-block.ts`: `registerMarker` at the echo's last row, `registerDecoration` on the `top` layer, and an `onRender` that positions the element and hides it outside the normal buffer as `markdown-block.ts`'s `position` does. It reads the row's text width from `terminal.buffer.active.getLine(marker.line)` on each render and places the element one cell after it, so a resize that reflows the line re-places it. When fewer cells remain than the marker needs, the element sits at the row's right edge over the last cells, with the terminal background behind it. It renders either `Thinking` with the spinner, built with `icon(faSpinner, { classes: ['fa-spin'] })` from `@fortawesome/fontawesome-svg-core` since a decoration is plain DOM rather than React, or the `see thought process` link, and switches between them in place. It stops its own `mousedown` from reaching xterm, so a press on it starts no terminal or reply selection (`holdReplySelection` in `reply-selection.ts` is the precedent for presses on a decoration), and `holdFocusOffSinglePress` (`press-focus.ts`) still keeps the keyboard in the command bar. Its tooltip and `aria-label` are `Open <name>`, and its `role` is `link`.
- `write-shell-reply.ts`: `writeShellEcho` returns whether it wrote the echo, so the caller can attach a marker to it. `writeShellReply` returns whether it wrote the reply's own command line (`placement.reply(line)` was true), so the caller can attach a link to that line. The line's row is the head row `insertMarkdownBlock` writes, or the head line of the styled-text fallback `formatDispatchedCommand` writes, so both paths report the row the same way.
- `useShellTerminal.ts` is near the limit (193 counted lines). Move `displayReply` and `echoCommand` out into a new `useShellReplyWriters.ts`, the way `useShellTerminalView.ts` was split out. `useShellTerminal` creates a fresh `Map` of running markers beside `new ReplyPlacement()` each time a terminal attaches (where `placementRef.current = placement` is set), so a re-attached terminal starts with none. xterm disposes markers and decorations with the terminal, so no cleanup of its own is needed. It passes `terminalRef`, `placementRef`, the map's ref, `openLinkRef`, and a new `openConnectionRef` (set from an `openConnection` option, like `openLink`) to `useShellReplyWriters`, and returns its two writers unchanged.
- `useShellReplyWriters.ts` (new) keeps the running markers in that `Map`, keyed by reply id, each entry holding its role, its receipt's name, and the decoration handles of its echo rows. `echoCommand(line, receipt?)` writes the echo and, when it was written and a receipt is present, adds an entry with a running marker on it. `displayReply(line, markdown, reply?)` writes the reply; when `reply.id` has an entry, it settles it and deletes it. With `reply.record`, every handle switches to the link and, when the reply wrote its own command line, a linked marker is added on that row too. Without a record, every handle is removed. A reply whose id has no entry (one written before its echo, or one replayed after a re-attach) writes exactly as today. Without `reply` (an application command's ordinary output from `useShellSubmit`), it also writes exactly as today.
- `useShellTabTerminal.ts`: pass `openConnection: (row) => { capabilities.openConnection?.(row); }` beside `openLink`.
- `useShellSubmit.ts`: on a `coreResponse` dispatch, read the receipt from `result.result` with `isShellAcpReceipt` and pass it to `echoCommand(text, receipt)`. A result without a receipt (`ask reset`, `tell reset`) echoes with no marker, as today.
- `useBackgroundReplies.ts`: pass the whole reply through as `displayReply(reply.line ?? 'monitor', reply.output, reply)`. Its `displayReply` parameter type gains the optional third argument. `ShellTab.tsx` (198 counted lines) keeps its `useBackgroundReplies(capabilities.onBackgroundReply, displayReply)` call unchanged and needs no edit.
- Clicking a running marker calls `openConnection` with `{ text: name, kind: 'acp', acpRef: { scope: 'tab', label: capabilities.label, role } }`. `plugin-client-capabilities.ts` drops an `acpRef` whose label is not this tab's, so the label must be the tab's own. Clicking a link calls it with `{ text: name, kind: 'acp', recordId }`. Neither needs a new capability or message.
- `shell.css`: the marker's muted text (`var(--muted)`), not bold; the spinner at the terminal font's size; the pointer cursor; and the link's look matching `.line.markdown a`.

### Documentation

- `product/specs/shell-tab.md` § Core ACP connections and `product/specs/acp.md` § Answers, activity, and questions: describe the marker, its link, when each appears, and that a `tell` reply is placed beneath its own echo.
- `help/ask.md` and `help/tell.md`: the marker and link, in one or two sentences each.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and `documentation/user-documentation/command-bar/shell.md`: the same, where they describe the echo and the answer.

## UI design

- **Surface.** The shell tab's xterm terminal, on the bold echoed command line the shell writes for an `ask` or `tell` (`shellCommandLine` in `shell-prompt.ts`). The marker is an HTML decoration anchored to that row, the same mechanism as the rendered Markdown reply blocks (`markdown-block.ts`), because terminal text cannot animate or be swapped once more output follows it.
- **Placement.** Inline, one cell after the command's last character, reading `> <command and params> Thinking <spinner>`. For a line that wraps, that is after the text on its last row. When that row has no room left, the marker sits at the row's right edge over its last cells, drawn on the terminal background so it reads cleanly. The settled link takes the marker's place.
- **Look.** `Thinking` is in the theme's muted text color and not bold, followed by the Font Awesome `faSpinner` icon spinning at the terminal font's size, the spinner `RemoteSessionButton` uses. The settled `see thought process` is styled like a link in a rendered shell reply (`.line.markdown a`), without literal brackets. Both take the terminal theme's colors, so they follow the light and dark themes as reply blocks do.
- **Interaction.** Pointer only. The pointer cursor shows over the marker and the link. A click opens or focuses the connection tab as the current centre tab and gives it focus, exactly as opening a row from the shell's connections window does. The shell's command bar keeps its draft for when the user returns. There is no new key binding or command, so nothing collides with `help/keys.md`; the connection tab stays reachable from the keyboard through `connections` and the shell's connections window.
- **Accessible name and tooltip.** Both the running marker and the link carry `Open acp:<role>:<tab name>`, the connection tab's own title, as their tooltip and accessible name (for example `Open acp:ask:shell`). The running marker's name comes from the dispatch receipt; the link's comes from the answering record.
- **States.** Running shows `Thinking` and the spinner. Settled with a record shows the link. Settled without a record (a refusal) shows nothing beyond the echo. While a full-screen program holds the terminal, markers and links hide and reappear when it returns, like reply blocks. They do not depend on how the reply was rendered: an echo above a reply that fell back to styled terminal text still gets its link. A resize re-places them after the echo text reflows. The marker and link are not terminal text, so terminal search does not see them and a terminal selection or copy does not include them.
- **Motion.** The spinner always spins, matching the app's other spinners. Reduced-motion handling is app-wide future work.
- **Code organization.** The client code lives in the shell plugin's own directory, `web/src/plugins/shell/`, per `ai/guidelines/react-code-organization.md`: the marker decisions in the `useShellReplyWriters` hook, the xterm drawing in `thinking-marker-decoration.ts`, wiring in the existing hooks, and no import from another feature. The server owns which record answered a prompt and its name, per `ai/guidelines/architecture-principles.md` §1; the client holds only what it draws.

## Tests

Client (vitest project `client`):

- `web/src/plugins/shell/thinking-marker-decoration.test.ts` (new), with a fake terminal as `markdown-block.test.ts` uses: the element sits one cell after the row's text and at the right edge when the row is full; it hides outside the normal buffer; it switches from `Thinking` to the link in place; it carries the `Open <name>` tooltip and accessible name; a `mousedown` on it does not reach the terminal.
- `web/src/plugins/shell/useShellReplyWriters.test.ts` (new): an echo with a receipt gets a running marker and one without gets none; a reply with a record beneath its echo links that echo; a reply that repeats its line links both rows; a reply without a record removes the marker; two echoes of the same line settle independently by id; a reply for an unknown id and an ordinary `displayReply(line, markdown)` write as today.
- `web/src/plugins/shell/useBackgroundReplies.test.ts`: the whole reply, `id` and `record` included, reaches `displayReply` as its third argument.
- `web/src/plugins/shell/ShellTab.test.tsx`: an `ask` line through settlement shows `Thinking`, then `see thought process`; clicking each calls `openConnection` with the tab `acpRef` and then the record id; a refused second prompt for the same line removes only its own marker; `ask reset` echoes without a marker.

Server (vitest project `server`):

- `src/commands/ask.test.ts` and `src/commands/tell.test.ts`: `run` returns `{ replyId, role, name }`, and the settled background entry's `background` equals that `replyId` (the existing cases assert `expect.any(String)`).
- `src/acp/response.test.ts` (new): `settleAcpPrompt` passes the pending prompt's `recordId` on the result, and none when it has none; `appendAcpBackgroundReply` stores `backgroundRecord` with the row's name, and nothing when the record is missing.
- `src/acp/manager-fallback.test.ts`: after a fallback, the settled result carries the answering model's record id, not the failed one's; when every model fails, the exhausted error carries the last model's record id.
- `src/acp/ask-role.test.ts`: the new helper keeps `recordId` on the exhausted error and returns a single-failure or answered result unchanged.
- `src/tab/background-replies.test.ts`: a `tell` and a `tell reset` reply carry their line, a `monitor ask` reply still does not, and `backgroundRecord` reaches the view as `record`.
- `src/agent/command-tools.test.ts`: a granted `coreResponse` command returns its `output`, not its JSON `result`.

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

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in a shell tab:
  - Run `ask what is 2+2`. The echo shows a muted `Thinking` and a spinning icon one cell after the line. Hovering shows `Open acp:ask:<tab name>`. Clicking opens the ask connection tab as the current centre tab with the running prompt in view.
  - When the answer arrives beneath the echo, the marker reads `see thought process` in link style. Clicking it opens the same record's connection tab.
  - Run `tell list the files here`, then run `ls` before it settles. The `tell` reply lands beneath a second `> tell …` echo, not a `> monitor` echo, and both `tell` echoes carry the link.
  - While a prompt runs, type the same `ask` line again. The second echo's marker disappears with the refusal; the first keeps thinking.
  - Run `ask reset` and `tell reset`: neither echo has a marker, and each confirmation lands beneath its own echo.
  - Start an `ask`, open `vim` before it settles, and quit. The marker or link is hidden while `vim` runs and back afterwards.
