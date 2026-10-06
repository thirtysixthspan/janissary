# Shell prompt and command lines in bold

**Complexity: 2/10** — two zsh settings added to the line the shell tab already types into zsh at setup, and the same bold attributes on the two lines the tab writes into the terminal itself. Shell plugin only.

The backlog asks: "in shell tabs, the prompt and executed command line text should be emphasized in order to separate it from the command output text." The shell tab sets zsh's prompt to a plain `> `, and the command after it is drawn in the same weight and colour as the output below it, so a long scrollback reads as one undifferentiated block. Three things write a command line into the terminal: zsh itself, for a line typed in the terminal or sent from the command bar (as a bracketed paste); the tab's echo of an application command answered as text (`formatDispatchedCommand`); and the same echo above a reply rendered as an HTML block (`insertMarkdownBlock`), each followed by a prompt the tab writes back.

## Goal

Every prompt and every command line in a shell tab's terminal is bold, whichever of the three wrote it, and command output stays in normal weight.

## Approach

**Let zsh draw its own lines bold.** The setup line becomes `export PROMPT='%B>%b '` plus `zle_highlight=(… default:bold)`. `%B…%b` bolds the prompt character; the `default` context of `zle_highlight` bolds the text in the line editor, and the cells keep that attribute once the line is accepted, so the executed command stays bold in the scrollback while the program's output is unaffected. Assigning `zle_highlight` replaces every context, so the array restates zsh's own defaults (`region:standout special:standout suffix:bold isearch:underline`) and sets `paste:bold`, so a line sent from the command bar looks like a typed one rather than reverse video.

**Write the tab's own lines with the same attributes.** A small `shell-prompt.ts` module holds the zsh setup fragment, the bold prompt the tab writes back after a reply, and a `shellCommandLine(line)` helper for the echo. `formatDispatchedCommand` and `insertMarkdownBlock` use them instead of literal `> ` strings, so the two can't drift from each other.

**Bold, not colour.** Bold reads as emphasis in every app theme and keeps the theme's own terminal palette intact; a colour would have to be chosen per theme.

Verified in the running app through the end-to-end browser: `ls -a` sent from the command bar, `echo …` typed in the terminal, and `help shell` answered by the application all show a bold `>` and bold command text above plain output.

## Implementation steps

1. **Add `web/src/plugins/shell/shell-prompt.ts`** with the zsh setup fragment, the bold prompt, and the command-line helper.
2. **Use the fragment in `shellStatusHooks`.**
3. **Use the prompt and helper in `formatDispatchedCommand` and `insertMarkdownBlock`.**
4. **Update the tests that pinned the plain prompt**, and the shell tab spec.

## Tests

- `shell-status-hooks.test.ts`: the setup line starts with the bold prompt and sets `zle_highlight` with `default:bold` and `paste:bold` alongside zsh's other defaults.
- `format-dispatched-command.test.ts`: the echoed command line and the fresh prompt are bold, and the reply between them is plain.
- Existing expectations in `format-dispatched-command.test.ts`, `markdown-block.test.ts`, `useShellTerminal.test.ts`, and `ShellTab.test.tsx` now expect the bold forms.

## Out of scope

- **Showing or hiding the prompt and cursor by focus.** A separate backlog item.
- **Colouring the prompt**, or honouring a user's own `PROMPT`; the tab already replaces it with `> `.
- **Harness and ssh terminals**, whose prompts belong to the programs running in them.
