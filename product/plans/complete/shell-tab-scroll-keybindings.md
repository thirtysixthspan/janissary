# Apply transcript scroll keys to the shell terminal

**Complexity: 5/10** — route the existing scroll key set to the active shell terminal's xterm scrollback.

## Goal

Make the shell tab's terminal respond to the transcript navigation keys listed in the pull-request backlog.

## Approach

Listen for the existing scroll keys while the shell tab is active, then use xterm's scrollback API. Match the transcript behavior for accelerated Shift/Ctrl+Arrow scrolling, half-screen Page Up/Down, Escape to bottom, and reset acceleration on key release. Leave app overlays and already-handled global shortcuts in control.

## Implementation steps

1. Add a small scroll-key handler for an xterm terminal, including acceleration and keyup reset.
2. Connect it to active shell tabs and test each key family and inactive/overlay behavior.
3. Update the shell-tab spec and user guide.

## Tests

Add focused tests for the scroll-key handler and shell integration in `web/src/plugins/shell/ShellTab.test.tsx`.

## Out of scope

- Changing agent-tab transcript scrolling.
- Changing zsh's own keyboard handling while the shell tab is inactive.
