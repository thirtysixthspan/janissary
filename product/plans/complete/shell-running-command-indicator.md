# Blink the shell tab dot while a command runs

**Complexity: 7/10.** A zsh prompt lifecycle signal must cross the terminal parser, plugin intent, tab payload, and client tab strip without conflating a running command with the long-lived shell process.

## Goal

Blink the shell tab and command-bar dots only while zsh is executing a command.

## Approach

Install zsh `preexec` and `precmd` hooks that emit OSC 133 command-start and prompt-ready markers. Parse those markers in xterm, report transitions through a declared shell intent, and store the transient flag in the shell payload for the tab strip to display.

## Implementation

1. Add an optional running state and shell instance key to the shell payload, plus a validated command-state intent that updates the owning shell tab.
2. Register the OSC handler, install the zsh hooks, and forward transitions through the intent.
3. Drive the shell command-bar dot and tab-strip dot from the running state.
4. Add protocol, activation, terminal, and UI tests; update the shell spec.
5. Run diff checks and remove the resolved PR backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after each implementation step and after tests.

## Out of scope

Changing the shell prompt's appearance or adding status support to other terminal tabs.
