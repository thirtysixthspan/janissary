# Strip terminal control sequences from shell-tab input and replies

**Complexity: 3/10** — one new pure client module and three call sites in the shell plugin; no server, wire, or plugin-contract change.

## Goal

Text the shell tab writes on the user's behalf can no longer carry terminal control sequences. A command routed to zsh cannot end its own bracketed paste early with an embedded `ESC[201~`, and cannot smuggle in a carriage return or other control byte that the line editor acts on. An application reply, and the command line echoed above it, cannot make xterm answer a query (`ESC[6n`, OSC queries) into the PTY or change terminal state (`ESC]7;…` cwd reports, title changes, mode switches).

## Approach

Add a pure `stripTerminalControls(text)` in `web/src/plugins/shell/strip-terminal-controls.ts`. It removes:

- `ESC` together with the sequence it introduces: a CSI (`ESC [` parameters, intermediates, final byte), a control string (`ESC ]`, `ESC P`, `ESC X`, `ESC ^`, `ESC _`) up to its BEL or string terminator, or a two-part escape (intermediates then a final byte). A lone `ESC`, or one whose sequence is cut short, is dropped by itself.
- Every C0 control other than `\n` and `\t`, which includes `\r`.
- `DEL` (`\x7f`) and the C1 controls (`\x80`–`\x9f`).

The review proposed a regex. A regex over control characters trips ESLint's `no-control-regex` (from `js.configs.recommended`), so the module is a single forward scan over the text instead: it is linear by construction, needs no lint suppression, and keeps `security/detect-unsafe-regex` out of the question entirely. The module carries comments saying why it exists and why it scans, and how each of its two sequence scanners treats a sequence that is cut short, since none of that is recoverable from the code alone.

Apply it in three places:

1. `shellCommandInput` in `web/src/plugins/shell/shell-command-input.ts` strips the command before deciding single-line versus multi-line and before framing, so both paths are covered and the paste markers it adds are the only escapes in its output.
2. `useShellSubmit`'s `runInShell` strips the line before handing it to `expectCommand`, so the pending-history matcher expects exactly what zsh will report in its `133;C` marker.
3. `displayReply` in `web/src/plugins/shell/useShellTerminal.ts` strips both the echoed line and the markdown once, at the top, before either path. The review named only the ANSI fallback, but `insertMarkdownBlock` writes the same echoed line raw into xterm (`> ${line}`), so stripping once before the branch closes both with one call.

`command-bar-keys.ts` is untouched: its control-key path deliberately writes `\x03`, `\x04` and `\x1a` and does not go through any of these functions.

## Implementation steps

1. Add `web/src/plugins/shell/strip-terminal-controls.ts` with its test file.
2. Use it in `shellCommandInput` and in `useShellSubmit`'s `runInShell`.
3. Use it at the top of `displayReply` in `useShellTerminal.ts`.
4. Update `product/specs/shell-tab.md`.

## Tests

- `strip-terminal-controls.test.ts`: plain text, `\n` and `\t` survive; CSI (`ESC[6n`, `ESC[201~`, SGR), OSC ended by BEL (`ESC]7;file:///tmp BEL`) and by `ESC \`, a DCS string, a two-part escape (`ESC(B`), a lone trailing `ESC`, an unterminated OSC, C0 (`\x03`, `\r`), `DEL`, and C1 (`\x9b`) are all removed; non-ASCII text and astral characters survive.
- `shell-command-input.test.ts`: `a\x1b[201~\nb` is framed as one paste with no early end marker; a single line containing `\x1b` and `\x03` is written without them.
- `useShellTerminal.test.ts`: the ANSI fallback reply with `\x1b]7;…\x07` and `\x1b[6n` in the markdown and the echoed line writes neither sequence.
- The existing multi-line framing case in `ShellTab.test.tsx` keeps passing.

## Out of scope

- The harness-tab `send` path (`src/harness/input.ts`), which frames text for a different program.
- PTY output, which is the terminal's own business.
- Control keys sent from the command bar (`Ctrl+C`, `Ctrl+D`, `Ctrl+Z`).
- User documentation: the user guide does not describe how control characters in a command are handled.
