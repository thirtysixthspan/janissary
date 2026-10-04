# Install shell hooks before showing terminal output

**Complexity: 4/10** — the shell already sends its zsh hooks at attach time; add a setup-ready marker and hide initial terminal output until the hooks are installed.

## Goal

Install the shell tab's `preexec` and `precmd` hooks before any shell output is visible.

## Approach

Keep the terminal surface hidden while the setup command is sent to zsh. When zsh reports the setup-ready OSC marker, clear the startup prompt and command echo, then reveal the terminal. The setup command installs the hooks, sets the plain prompt, and emits the marker before zsh draws its next prompt.

## Implementation steps

1. Add the setup-ready marker after the zsh hooks and hide/clear the terminal until that marker arrives.
2. Test the pre/post hook setup command and the hidden-to-ready transition.
3. Update the shell-tab spec and user guide to describe the startup behavior.

## Tests

Extend `web/src/plugins/shell/useShellTerminal.test.ts` to verify hook registration, output hiding, reset, and reveal on the ready marker. Run the diff-scoped checks.

## Out of scope

- Changing how commands are routed or how the terminal behaves after startup.
