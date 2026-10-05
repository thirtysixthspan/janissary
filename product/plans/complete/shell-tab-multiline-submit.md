# Submit multi-line shell commands as one paste

**Complexity: 3/10** — the command bar already preserves multi-line text; only the PTY input framing needs to keep embedded newlines inside one shell submission.

## Goal

When a multi-line command-bar value is routed to zsh, insert it as one bracketed paste and submit it once so compound commands do not execute one line at a time.

## Approach

Keep ordinary single-line input unchanged. Wrap multi-line input in the terminal's bracketed-paste delimiters, then send one carriage return to submit the complete pasted buffer. Keep the pending-command history matcher able to associate zsh's command markers with each line of the submitted compound command.

## Implementation steps

1. Add a pure formatter for the bytes sent to zsh and use it for command-bar submissions.
2. Test single-line compatibility, multi-line framing, and the command-bar-to-shell path.
3. Update the shell-tab spec and user guide to describe a multi-line submission as one command.

## Tests

- Single-line commands still end with one newline and have no paste delimiters.
- Multi-line commands are wrapped in bracketed-paste delimiters and end with one submit carriage return.
- A multi-line command forced to zsh from the command bar is delivered in that format.

## Out of scope

- Changing direct terminal typing or paste behavior.
- Changing application-command routing or shell queue ordering.
