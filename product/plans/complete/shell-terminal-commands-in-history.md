# Record commands typed into the shell terminal in the tab's command history

**Complexity: 4/10** — The shell tab's command history (what `Up`/`Down` walk and what `Ctrl+R` and `hist` list) holds only the lines the command bar sent or the application handled. A command typed straight into the terminal after `Shift+Tab` runs in zsh and never reaches that list, so the bar cannot recall it. The tab already installs a zsh `preexec` hook that marks each command's start; that hook can carry the command text, and the tab can add it to the history unless the bar sent that line itself.

## Goal

Every command zsh runs in a shell tab — typed into the terminal or sent from the command bar — appears once in the tab's command history, in the order it ran.

## Approach

Extend the `preexec` hook's existing command-start marker (OSC 133 `C`) with the command line exactly as typed (zsh's first `preexec` argument, falling back to the third when history is off), base64-encoded so newlines, quotes and control characters survive the escape sequence. The terminal hook decodes it and reports the command alongside the running state.

The tab records a reported command unless the command bar is the one that sent it. Lines the bar writes to zsh are already recorded as typed in the bar (keeping a `!` prefix that a recall needs), so the bar registers each line it writes as pending, and a reported command that matches a pending line consumes it instead of being added again. A multi-line bar submission that zsh runs as separate commands consumes its pending entry one line at a time.

## Implementation

1. `web/src/plugins/shell/shell-command-marker.ts`: `decodeShellCommand(marker)` returns the command a `C;<base64>` marker carries, or nothing for a bare `C`, an empty command or an undecodable payload.
2. `web/src/plugins/shell/pending-shell-lines.ts`: `PendingShellLines` with `expect(line)` and `claim(command)`.
3. `web/src/plugins/shell/useTerminalCommandHistory.ts`: owns one `PendingShellLines`, and returns `expect` and an `onCommand` that appends unclaimed commands to the tab's sent lines.
4. `useShellTerminal`: send the command text in the `preexec` marker, accept an optional `onCommand`, and report decoded commands from the 133 handler.
5. `useShellSubmit`: call `expectCommand(line)` before every line it writes to zsh, including drained queue lines.
6. `ShellTab`: wire the hook between the terminal and the submit path.
7. Update the shell-tab spec's history paragraph, and the shell user guide's matching sentence if it says terminal commands stay out of the bar's history.

## Tests

- `shell-command-marker.test.ts`: decodes ASCII, Unicode and multi-line commands; ignores a bare marker, an empty command and invalid base64.
- `pending-shell-lines.test.ts`: claims an expected line once; does not claim an unexpected command; consumes a multi-line expected entry one line at a time; drops older pending entries zsh never ran when a later one is claimed.
- `useShellTerminal.test.ts`: the hook carries the command text in its `preexec` marker, and a `C;<base64>` marker reports both running and the decoded command.
- `ShellTab.test.tsx`: a command typed into the terminal is recallable with `Up` and listed by `hist`; a line sent from the bar appears once even after zsh reports it.

## Out of scope

- Adding terminal commands to the global history used for ghost suggestions.
- Reading zsh's own history file.
