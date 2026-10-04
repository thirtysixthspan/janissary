# Use a plain prompt in shell tabs

**Complexity: 2/10** — add the requested prompt assignment to the existing zsh setup command and pin it in the terminal hook test.

## Goal

Show only `> ` as the shell tab's zsh prompt, regardless of the user's prompt formatting.

## Approach

Add the exact `export PROMPT='> '` assignment to the setup command the terminal sends to zsh when it attaches. This changes the shell tab's prompt while preserving the rest of the user's startup configuration.

## Implementation steps

1. Set `PROMPT` in the shell integration command.
2. Test that the setup command contains the prompt assignment.
3. Update the shell-tab spec and user guide to describe the plain prompt.

## Tests

Extend `web/src/plugins/shell/useShellTerminal.test.ts` to assert the setup command includes the requested prompt. Run the diff-scoped checks.

## Out of scope

- Changing prompt behavior for other shells or terminal surfaces.
- Skipping the user's zsh startup files.
