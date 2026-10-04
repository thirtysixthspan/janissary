# Record application commands in shell history

**Complexity: 3/10** — add handled command-bar lines to the shell tab's existing local history.

## Goal

Let Up, Down, and Ctrl+R recall application commands submitted from the shell tab, alongside lines sent to zsh.

## Approach

The shell tab already stores bar submissions in `sent`. Add a line when the host interception claims an application command, and when the dispatch intent reports that it handled the line. Leave unclaimed lines in the existing shell-history path.

## Implementation steps

1. Record successful intercepted and dispatched application commands in the shell's local history.
2. Add regression coverage for both paths and verify unclaimed lines still reach zsh.
3. Update the shell-tab functional spec.

## Tests

Extend `web/src/plugins/shell/ShellTab.test.tsx` to verify history recall of an intercepted command and a dispatched application command.

## Out of scope

- Changing the application's global history.
- Recording commands typed directly into the terminal, which remain in zsh's history.
