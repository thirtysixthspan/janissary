# Send lines through the shell command bar

## Complexity

3/10. The shell command queue already wakes for externally added lines; this change updates the send route, its tests, and the descriptions of shell input.

## Goal

Make `send <shell-tab> <text>` behave like a line submitted in that shell tab's command bar.

## Approach

When the target plugin tab owns a terminal, enqueue the line in its existing per-tab shell queue instead of writing directly to the PTY. The shell client drains the line through its normal command-bar handler, which runs application commands first and sends unclaimed lines to zsh.

## Implementation steps

1. Change plugin-terminal delivery in `src/commands/send.ts` to enqueue the text after confirming the target owns a terminal.
2. Update `src/commands/send.test.ts` to assert shell lines enter the queue and are not written directly to the PTY; keep coverage for plugins without terminals.
3. Update the send and shell-tab specs, `help.md`, and the existing send user guide to describe command-bar routing.

## Tests

- `src/commands/send.test.ts`: plugin terminal target enqueues without direct PTY input; plugin tab without a terminal remains unsupported.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specs and docs

- `product/specs/send.md`: describe shell-tab delivery through the command bar and shell FIFO.
- `product/specs/shell-tab.md`: describe external send lines as command-bar submissions.
- Update `help.md` and `documentation/user-documentation/command-bar/send.md` to describe command-bar routing.

## Out of scope

- Changing harness PTY delivery or agent command dispatch.
- Changing the shell's existing queue, command routing, or terminal input behavior.
