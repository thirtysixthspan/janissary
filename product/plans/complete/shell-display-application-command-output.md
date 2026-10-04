# Show application command output in the shell terminal

**Complexity: 8/10** — Shell-tab application commands currently execute through the host dispatcher, but their transcript output is hidden and the shell plugin receives only a boolean result. The fix must capture async output and render it locally without sending the command to zsh.

## Goal

When an application command with transcript output is entered in the shell command bar, show the command and its reply in the terminal as if they ran there, while keeping the application command on its existing dispatcher path and never sending it to zsh.

## Approach

Keep the existing boolean dispatch capability intact and add an additive capability that returns whether a line was claimed plus the command's captured transcript output. Capture output around the existing command executor. Add a terminal display method that writes directly to xterm's screen rather than to the PTY, then have the shell plugin use it for claimed commands. Unclaimed commands continue through the real shell input path.

## Implementation

1. Add a declared-gated `dispatchLineWithOutput` capability and a command-manager path that returns output emitted while the existing application command runs.
2. Add local terminal display formatting and render the command, output, and next prompt only for claimed commands; preserve zsh input for unclaimed lines.
3. Test direct output and asynchronous output capture, the shell display path, and the no-dispatch-to-zsh behavior; update shell and plugin specs and existing user docs.

## Tests

- Verify output-only commands and registry commands return the text they append, including async completion and command errors.
- Verify the shell displays the handled command and response through xterm while unclaimed commands still write to the PTY.
- Run the diff-scoped lint, typecheck, and related server and web tests.

## Out of scope

- Changing application command routing, shell recognition, or command capture used by agent messages.
- Rendering transcript output for shell commands that are not handled by the application.
