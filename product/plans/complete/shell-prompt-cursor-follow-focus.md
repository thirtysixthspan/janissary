# Shell terminal prompt and cursor follow focus

**Complexity: 4/10** — one xterm option and one small client-side module that masks the live prompt, wired into the terminal hook the shell tab already has. No zsh change, no server change.

The backlog asks: "in shell tabs, when the keyboard focus is in the terminal, the command prompt and cursor should be visible, but disappear when the keyboard focus is on the command line." With the command bar focused, the terminal still shows zsh's live `> ` prompt and an outlined cursor at its bottom, a second prompt competing with the command bar's own, and it reads as though the terminal were waiting for keys it will not get.

## Goal

While the keyboard is in the terminal, its live prompt and cursor show as they do now. While the keyboard is anywhere else, the command bar included, the terminal shows neither. Prompts on earlier command lines in the scrollback stay visible, and a program running in the terminal is drawn untouched.

## Approach

**Cursor: let xterm hide it.** xterm 6's `cursorInactiveStyle: 'none'` draws no cursor while the terminal does not hold focus, and the usual blinking block while it does.

**Prompt: mask it on the client, not in zsh.** Changing zsh's `PROMPT` on focus would mean injecting key sequences into zsh's input whenever focus moved, and rebinding widgets the user's own startup files may already use. The tab already knows the two facts the rule needs: whether zsh is idle at its prompt (the signed `133;C`/`133;D` markers) and whether the terminal holds focus (its input textarea). While zsh is idle and the terminal is unfocused, a small xterm decoration covers the prompt's cells — the first two columns of the cursor's row, the width of `> ` — with the terminal background. It follows the cursor's row, so after a command the new prompt is masked rather than the old one, and it is removed the moment the terminal gains focus or a command starts.

**Why the cursor's row.** zsh prints `133;D` before it draws the prompt, so at the moment the shell turns idle the prompt is not on screen yet. The mask therefore re-places itself whenever the cursor moves while it applies, which lands it on the prompt as soon as zsh has drawn it.

**Earlier command lines stay whole.** A command sent from the command bar is echoed on the prompt's row while still masked; when its `133;C` arrives the shell is no longer idle, the mask is removed, and the line reads `> command` in the scrollback, as the bold-prompt change intended.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The terminal, its options, and the running callback from the markers | `web/src/plugins/shell/useShellTerminal.ts` |
| A decoration rendered over terminal rows | `web/src/plugins/shell/markdown-block.ts` |
| The prompt text | `web/src/plugins/shell/shell-prompt.ts` |
| xterm fakes to extend | `ShellTab.test.tsx`, `useShellTerminal.test.ts`, `App.launch-focus.test.tsx` |

## Implementation steps

1. **Export the prompt's width** from `shell-prompt.ts`.
2. **Add `web/src/plugins/shell/prompt-mask.ts`**: `attachPromptMask(terminal)` returning `{ setIdle, dispose }`, tracking focus through the terminal's textarea and re-placing its decoration on cursor moves.
3. **Wire it into `useShellTerminal`**: set `cursorInactiveStyle: 'none'`, attach the mask after `open`, feed it the running state from the markers, dispose it with the terminal.
4. **Style the mask** in `shell.css` with the terminal background.
5. **Update the shell tab spec.**

## Tests

In a new `web/src/plugins/shell/prompt-mask.test.ts`, against a small fake terminal:

- No mask while the shell is running, focused or not.
- Idle and unfocused: one decoration on the cursor's row, two cells wide from column 0, carrying the mask class when rendered.
- Focusing the terminal removes the mask; blurring it while idle brings it back.
- A command starting removes the mask.
- A cursor move to a new row while masked moves the mask there, disposing the old one; a move within the row keeps it.
- Disposing removes the mask and stops following the cursor.

In `useShellTerminal.test.ts`:

- The terminal is created with `cursorInactiveStyle: 'none'`.

The rendered result is checked in the running app through the end-to-end browser: with the command bar focused the terminal shows no live prompt or cursor; after `Shift+Tab` both are visible; earlier `> command` lines stay visible throughout.

## Out of scope

- **Prompts on earlier lines**, which stay as command markers in the scrollback.
- **Hiding a running program's own prompt or cursor** (a `python` or `ssh` prompt): the mask applies only while zsh itself is idle, and the cursor rule is xterm's.
- **A multi-line edit buffer left in zsh** while the terminal is unfocused: only the prompt is masked, not text typed after it.
