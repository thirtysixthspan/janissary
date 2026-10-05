# Send commands to shell tabs

## Complexity

4/10. The change touches the `send` command, the bundled shell plugin contract, its host capability, and the send and shell-tab specs.

## Goal

Allow `send <shell-tab> <text>` to enter a line into that shell tab's zsh session, matching input typed into its terminal.

## Approach

Keep terminal ownership with the tab and use the host's existing PTY ownership lookup, which is already used to deliver scheduled lines to plugin terminals. A plugin tab accepts input only when the host has a non-transport terminal registered to that tab. Preserve the existing behavior for harness and agent tabs and keep unsupported plugin tabs rejected.

## Implementation steps

1. Extend `send` to write a line to a plugin tab's host-owned terminal, when one exists.
2. Add command tests for shell-terminal delivery and the existing unsupported-plugin error.
3. Update the send and shell-tab functional specs, plus `help.md` and the existing send user guide.

## Tests

- `src/commands/send.test.ts`: sending to a shell tab writes the line and records the usual success line; plugin tabs without a terminal still report that they do not accept input.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specs and docs

- `product/specs/send.md`: document shell-tab line delivery and its unsupported-tab behavior.
- `product/specs/shell-tab.md`: document input sent from another tab.
- `help.md` and `documentation/user-documentation/command-bar/send.md`: document the newly supported target.

## Out of scope

- Sending input to non-shell plugin tabs or changing `send` behavior for harness and agent tabs.
- Adding a second PTY or command queue for shell tabs.
- Changing cross-agent `msg` or `queue` behavior.
