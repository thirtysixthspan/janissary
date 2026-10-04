# Move focus between the shell terminal and command bar

**Complexity: 6/10.** The terminal is configured as output-only, so direct terminal input and a reverse focus path need to be added alongside the existing command bar path.

## Goal

Let Shift+Tab move focus between the shell terminal and its command bar, with keystrokes going to whichever surface owns focus.

## Approach

Enable xterm input and route its data through the existing host-authorized terminal handle. Keep the command bar as the initial focus, and handle Shift+Tab in each direction.

## Implementation

1. Enable terminal stdin, forward xterm data through the existing handle, and return a terminal-focus callback from the hook.
2. Handle Shift+Tab in both surfaces and focus the terminal on pointer interaction.
3. Add focus and input tests, update the shell spec, and remove the PR backlog entry.
4. Run diff checks and push to the existing pull request.

## Tests

Run `./scripts/run.mjs check-diff` after each implementation step and after tests.

## Out of scope

Changing shell command routing or terminal selection and clipboard behavior.
