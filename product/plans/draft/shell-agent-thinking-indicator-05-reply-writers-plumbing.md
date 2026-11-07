# Shell reply writers split and marker hooks
**Complexity: 3/10** — a mechanical hook extraction out of a file at 193 of 200 counted lines, plus two small contract additions on the writers (a return value and a row-marker callback); every existing caller behaves exactly as before.

## Goal

Create room and a seam for the marker work. Move `displayReply` and `echoCommand` out of `web/src/plugins/shell/useShellTerminal.ts` into a new `useShellReplyWriters.ts`, with no change in behavior. Then give the two functions in `write-shell-reply.ts` the means to say what they wrote and to hand back a terminal row marker for the line they wrote, so `06-marker-lifecycle` can attach markers to those rows. No caller uses the new return values or callbacks yet.

## Design decisions and dependencies

This subplan is client-only and depends on no earlier subplan. `06-marker-lifecycle` consumes everything defined here. It is independent of `04-marker-decoration`.

Source plan requirements carried here: "Shell client changes" bullets on `write-shell-reply.ts` (`writeShellEcho` returns whether it wrote the echo; `writeShellReply` returns whether it wrote the reply's own command line, so the caller can attach a link to that line; both paths report the row the same way) and on `useShellTerminal.ts` (`displayReply` and `echoCommand` move to a new `useShellReplyWriters.ts`, "the way `useShellTerminalView.ts` was split out", with `useShellTerminal` returning its two writers unchanged); "Out of scope" that placement rules stay as they are; "Code organization" (the hook lives in the shell plugin's directory, no import from another feature).

- Extraction owned here: `useShellTerminal.ts` to `useShellReplyWriters.ts`. This is the file-size extraction the source plan names for that file. The new hook takes the refs it needs (`terminalRef`, `placementRef`, and `openLinkRef`, the last typed as the ref `useShellTerminal` already holds for `openLink`) and returns `{ displayReply, echoCommand }`, each a stable `useCallback` that reads its refs at call time, like `useShellTerminalView` does. `placementRef.current` is replaced at every attach, so the hook must read it at call time and not capture it. `ShellTerminalHandle` and its callers do not change in this subplan. Counting: the import of the two writers and the two `useCallback` blocks leave `useShellTerminal.ts` (about ten counted lines) and one import and one call go in, so it lands near 185.
- `writeShellEcho(terminal, placement, rawLine, onMarker?)` returns `true` when it wrote the echo (when `placement.echo` allowed it) and `false` when it skipped it. When it wrote the echo and `onMarker` is given, it calls `onMarker` once the echo has been parsed, with the marker for the echo's last row. The marker is `terminal.registerMarker(-1)` taken inside the write's completion callback: the echo is written as the command line followed by a fresh prompt, so when the callback runs the cursor sits on the prompt row and offset `-1` is the line's last row, which for a wrapped line is its last wrapped row. It must be taken in the callback because the write is asynchronous and the cursor has not moved yet when the function returns. If `registerMarker` returns nothing (the alternate buffer is active), `onMarker` is not called.
- `writeShellReply(terminal, placement, rawLine, rawMarkdown, openLink, onHeadMarker?)` returns `true` when the reply wrote its own command line (`placement.reply(line)` was true) and `false` when it continued beneath an echo. When it wrote its own line and `onHeadMarker` is given, it writes that line on its own first (the command head, with a completion callback that takes `registerMarker(-1)` and passes it to `onHeadMarker`), then lets the reply continue exactly as it does beneath an echo: the Markdown block, or the styled-text fallback, with no head. Without `onHeadMarker` nothing changes, the reply is one write as today, so every existing assertion on `terminal.written` stays valid. This is the decision the source plan left open: a boolean alone cannot say where the line's row is, and in the styled-text fallback the number of rows the reply body occupies is not known until it is parsed, so the head cannot be located after the fact. Writing the head separately only when a marker is wanted, and only for the replies that will get a link, keeps both paths reporting the row the same way without changing any other write. The reply's later write clears the empty row after the head (`commandHead` with no line starts by clearing the row), which is harmless.
- Both functions keep stripping terminal controls from the line and the Markdown, keep calling `ReplyPlacement` in the same order, and keep their current placement outcomes.
- The `IMarker` type comes from `@xterm/xterm`, a package import the plugin lint rule allows.
- `useShellTerminal.test.ts` already exercises `displayReply('help', '**bold** reply')` and a reply with terminal controls through `useShellTerminal`; those cases are the behavior-preservation check for the extraction.
- The source plan describes the line's row as "the head row `insertMarkdownBlock` writes". `markdown-block.ts` is not modified: the head is now written by `write-shell-reply.ts` before the block when a marker is wanted, and `insertMarkdownBlock` is called with no head in that case.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The two writers to move | `displayReply` and `echoCommand` in `web/src/plugins/shell/useShellTerminal.ts` | Moved without change in behavior. |
| The split precedent | `useShellTerminalView.ts` (takes refs, returns stable callbacks) | The shape of the new hook. |
| Writers and placement | `writeShellReply`, `writeShellEcho` in `write-shell-reply.ts`; `ReplyPlacement` in `reply-placement.ts` | Gain return values and callbacks; placement logic is untouched. |
| Head and prompt strings | `commandHead`, `SHELL_PROMPT` in `shell-prompt.ts`; `formatEchoedCommand`, `formatDispatchedCommand` in `format-dispatched-command.ts` | Reused as they are. |
| Markdown block insertion | `insertMarkdownBlock` in `markdown-block.ts` | Called as before; with no head when the head was written separately. |
| Fake terminal | `fakeTerminal` in `markdown-block.test.ts` (its `write(data, callback)` runs the callback at once) | The pattern for the new writer tests. |

## Proposed changes

- `web/src/plugins/shell/write-shell-reply.ts`: the two return values and the two optional callbacks, as above. Update the comment on each function.
- `web/src/plugins/shell/useShellReplyWriters.ts` (new): the hook with the two moved callbacks, calling the writers exactly as `useShellTerminal` did.
- `web/src/plugins/shell/useShellTerminal.ts`: remove the two callbacks and the writer import; call `useShellReplyWriters(terminalRef, placementRef, openLinkRef)`; return its two callbacks in the same place in the returned object. Keep every exported type and option as it is. If the line count is not under 195 after the edit, extract a further cohesive block into a sibling module; do not compact.

## Tests

Client (vitest project `client`), colocated:

- `web/src/plugins/shell/write-shell-reply.test.ts` (new), with a fake terminal like `markdown-block.test.ts` plus `registerMarker`:
  - `writeShellEcho` returns `true` and writes the echo, and `false` with no write when `ReplyPlacement` says the reply was written first;
  - with `onMarker`, it is called once, after the write's callback, with the marker registered at offset `-1`; it is not called when the echo is skipped or when `registerMarker` returns nothing; without it, the echo is the single `formatEchoedCommand` write as today;
  - `writeShellReply` returns `false` for a reply beneath its own echo and `true` when it repeats its line;
  - with `onHeadMarker` and a repeated line, the head is written alone first, the marker is registered at offset `-1` in its callback and passed on, and the Markdown block is then written with no head; the same for the styled-text fallback when the block cannot be placed (no screen to measure), where the body written afterwards carries no head;
  - with `onHeadMarker` but a reply beneath its echo, the callback is never called and the writes are as without it;
  - without `onHeadMarker`, a repeated line is one write containing the head and the body, as today.
- `web/src/plugins/shell/useShellTerminal.test.ts` and `useShellTerminal.press-focus.test.ts` run unchanged and pass.
- `web/src/plugins/shell/ShellTab.test.tsx` runs unchanged and passes: its existing ACP echo and reply cases assert exact `terminal.written` entries and must not see a split write.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npx vitest run --project client web/src/plugins/shell/write-shell-reply.test.ts web/src/plugins/shell/useShellTerminal.test.ts web/src/plugins/shell/useShellTerminal.press-focus.test.ts web/src/plugins/shell/ShellTab.test.tsx web/src/plugins/shell/markdown-block.test.ts`. Confirm `useShellTerminal.ts` is under 200 counted lines with the margin stated above, because `06-marker-lifecycle` adds a few lines to it.

A smoke check is possible by a person or a browser-capable tool: `ask hi` and `help` in a shell tab write their echoes and replies exactly as before. Nothing about this subplan is visible, so that is the whole check.

## Out of scope

- Using the new return values or callbacks, the per-terminal entry map, and any marker (`06-marker-lifecycle`).
- The `openConnection` and label options on `useShellTerminal` (`06-marker-lifecycle`).
- Any change to `ReplyPlacement`, `markdown-block.ts`, or the placement rules.
- Reading the receipt or the reply in `useShellSubmit` and `useBackgroundReplies` (`07-client-wiring`).
