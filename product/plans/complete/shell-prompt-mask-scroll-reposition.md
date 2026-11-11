# Keep the shell prompt mask on the prompt after output scrolls the terminal

**Complexity: 2/10** — ~3 added lines in 1 production file, 3 requirements and 3 test scenarios, no new units (p=3.67).

The backlog reports that asking a question in a shell tab leaves the command line and the prompt out of step. Visually the echoed line reads without its leading `>`, while the empty prompt sits on the line beneath it. Copying the terminal rows shows both prompts — `> ask …` and a lone `>` — because the buffer still holds them: the first prompt is hidden on screen, not absent.

## Root cause

`attachPromptMask` hides zsh's waiting prompt while the keyboard is outside the terminal, and it follows the prompt by re-registering its decoration when xterm fires `onCursorMove`. That event is fired by `InputHandler.parse` only when the cursor's **viewport** position differs from where it started. An application command's echo writes `\r`, the command line, `\r\n`, and a fresh `> ` at an otherwise-idle prompt. When the terminal is already scrolled to its last row — the normal state of a live shell — the line feed scrolls the buffer, so `baseY` rises while `cursorY` returns to the same value; the final column is also the same as before, so no cursor-move event fires at all.

The decoration's marker keeps its absolute line while the buffer scrolls under it. It therefore comes to rest on the echoed command's row rather than the fresh prompt's row, and paints over the command's `> `. The fresh prompt's own `>` remains visible, which is the second prompt the report describes. Confirmed against `@xterm/headless`: after a scrolling echo write, `onCursorMove` fires zero times while `onWriteParsed` fires once, and the cursor has moved one absolute row past the marker.

## Goal

The prompt mask stays on the row the cursor is on after any write is parsed, including a write that scrolls the terminal. An application command's echo shows its own `>` and leaves no second prompt visible, and the mask never covers a command line in the scrollback.

## Approach

Keep the existing `onCursorMove` subscription and add `onWriteParsed`, both calling the same `update`. `onWriteParsed` fires after each write batch finishes parsing, whether or not the cursor's viewport position changed, so a scroll-induced row change is seen. `update` already compares the marker's absolute line with the cursor's absolute row and does nothing when they agree, so the extra event costs a comparison and no decoration churn. Dispose the new subscription beside the cursor one.

## Implementation steps

1. **`web/src/plugins/shell/prompt-mask.ts`** — subscribe `update` to `terminal.onWriteParsed` alongside `onCursorMove`, and dispose it in `dispose`.
2. **Test fakes** — add `onWriteParsed() { return { dispose: () => {} }; }` to the xterm stubs in `web/src/plugins/shell/ShellTab.test.tsx`, `web/src/plugins/shell/useShellTerminal.test.ts`, `web/src/plugins/shell/useShellTerminal.press-focus.test.ts`, and `web/src/App.launch-focus.test.tsx`.

## Tests

In `web/src/plugins/shell/prompt-mask.test.ts`:

- A parsed write that scrolls the buffer without a cursor-move event moves the mask from the old absolute line to the cursor's new one and disposes the old decoration. The fake advances `baseY` while leaving `cursorY` alone, exactly the live scroll case.
- A parsed write that leaves the cursor's row unchanged keeps the existing decoration, so ordinary output does not churn it.
- Disposing stops the parse subscription too.

## Specs and docs

- `product/specs/shell-tab.md` § Choose where keys go: the mask follows the prompt when parsed output scrolls the terminal, including an application command's echo, and never covers the command line above the waiting prompt.
- `help/` and `documentation/user-documentation/` do not describe the prompt mask, so no help or user-guide change is needed.

## Out of scope

- Changing the terminal buffer, the echoed line, or the reply placement; the copy still contains the waiting prompt row, which is normal terminal buffer content.
- Harness and ssh terminals, whose prompts belong to the programs running in them.
- The mask's focus rules and its width.
