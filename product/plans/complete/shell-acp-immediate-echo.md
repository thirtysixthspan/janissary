# Echo a shell ACP command at once and answer beneath it

Issue: after issuing an acp command in the shell, the acp command should be immediately printed in the terminal, even though there is no response. when the response comes back, print the response after the command line. if other commands have run in the meantime, reprint the command and the response.

Complexity rating: 5/10

## Goal

A shell's `acp <prompt>` returns to the bar at once, but today nothing appears in the terminal until the prompt settles. Only then does the shell write an echo of the typed line followed by the Markdown reply. Make the typed line appear in the terminal the moment the command is accepted. When the reply arrives and nothing else has been written to the terminal since that echo, write the reply directly beneath it without repeating the line. When anything else reached the terminal in between (shell output, another application command's reply, another ACP echo), keep today's behavior: write the line again followed by the reply at the current bottom.

## Approach

This is client-only. The server already answers a `coreResponse` dispatch at once (`CommandManager.dispatchLine` in `src/command/manager.ts`) and later delivers one background reply carrying the exact typed `line` (`backgroundRepliesFor` in `src/tab/background-replies.ts`). Only the terminal rendering in `web/src/plugins/shell/` changes, and where text lands in a terminal is view-local, so architecture principle 1 is unaffected.

`useShellSubmit` echoes the line when a dispatch result reports `coreResponse` instead of doing nothing. The echo is the bold command line, a newline, and a fresh prompt, matching what an ordinary application command's reply starts with.

A new pure class, `ReplyPlacement` in `web/src/plugins/shell/reply-placement.ts`, decides whether an echo or a reply needs the command line. It counts every write that reaches the terminal (PTY data and the tab's own writes) and remembers the last echo or reply along with the count at that moment:

- A reply whose line matches the last echo, with no write since, continues beneath it and carries no command line. That consumes the echo.
- Any other reply carries its command line, as today.
- An echo whose line matches a reply that was the last write skips itself. This covers a reply that reaches the client before its dispatch result does. `acp reset` appends its reply synchronously inside `run`, and an immediate refusal can settle in a microtask, so the state broadcast carrying the reply can arrive ahead of the intent answer. Without this the line would print twice.

Counting writes rather than reading the cursor keeps the decision synchronous and exact. A write queued but not yet parsed by xterm still counts, so nothing can slip between the check and the write. Conservative cases, such as a resize that makes zsh redraw its prompt, simply reprint the line, which is the documented fallback.

The reply writers take an optional line. `insertMarkdownBlock` in `markdown-block.ts` and `formatDispatchedCommand` in `format-dispatched-command.ts` start with a cleared row and the bold command line today; with no line they start with the cleared row only, so the reply begins on the prompt row the echo left. The block's geometry is unchanged because it is anchored on the rows written after the head. A shared `commandHead(line?)` in `shell-prompt.ts` builds that head for both. The writing glue moves out of `useShellTerminal.ts` into a new `write-shell-reply.ts`, which keeps that hook under the 200-line limit.

Rejected alternative: deciding by cursor position. It needs a write callback to read a settled cursor, makes the decision asynchronous, and can match by accident when unrelated output leaves the cursor on the same cell.

## Implementation steps

1. Add `commandHead(line?: string)` to `web/src/plugins/shell/shell-prompt.ts` and use it in `insertMarkdownBlock` and `formatDispatchedCommand`, both taking `line: string | undefined`. Add `formatEchoedCommand(line)` beside `formatDispatchedCommand`.
2. Add `ReplyPlacement` in `web/src/plugins/shell/reply-placement.ts` with `wrote()`, `echo(line): boolean`, and `reply(line): boolean`.
3. Add `write-shell-reply.ts` with `writeShellReply` and `writeShellEcho`, which consult the placement and write through the terminal.
4. In `useShellTerminal.ts`, create a `ReplyPlacement` per terminal, count PTY data and `display` writes, route `displayReply` through `writeShellReply`, and expose a new `echoCommand(line)` on the handle.
5. Pass `echoCommand` from `ShellTab.tsx` into `useShellSubmit`, which calls it for a dispatched `coreResponse` result.

## Tests

- `web/src/plugins/shell/reply-placement.test.ts`: a reply right after its echo needs no line; a reply after any write since the echo needs its line; a reply for a different line needs its line; an echo right after the same line's reply is skipped, once; a second reply after a consumed echo needs its line again.
- `web/src/plugins/shell/format-dispatched-command.test.ts`: with no line the output starts with the cleared row and the reply and ends with a fresh prompt; `formatEchoedCommand` writes the bold line and a prompt.
- `web/src/plugins/shell/markdown-block.test.ts`: with no line the block is written with no command line and the same number of blank rows.
- `web/src/plugins/shell/ShellTab.test.tsx`: the existing ACP case now sees the echo right after dispatch and, after PTY output arrived, a reply that repeats the line; a new case sees the reply beneath the echo without a second command line when nothing came in between; a new case sees a reply that arrived before its dispatch result printed with its line once and no later echo.

## Out of scope

- Server dispatch, background reply delivery, and the reply's content.
- The launcher and other plugins that use `onBackgroundReply`.
- `acp` when ACP is unavailable for the tab, which already falls back to the ordinary dispatcher and has no background reply.
- The remaining pull-request backlog entry (connection tab metadata bar).

## Specs and docs

- `product/specs/shell-tab.md` and `product/specs/acp.md`: the typed line appears at once; the reply continues beneath it when nothing else was written, and otherwise repeats the line at the current bottom.
- `product/specs/tab-plugins.md`: the shell's ACP sentence notes the immediate echo.
- `help/acp.md`, `documentation/user-documentation/command-bar/shell.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `documentation/user-documentation/getting-started/tabs.md`: the same behavior in user terms.
