// What the persistent-shell protocol writes to a shell's stdin, in its own module because it is read
// back as well as written. A detached remote peer retains what was sent to a piped shell and replays
// it when a session is attached, and `restored-transcript.ts` recovers each command from exactly this
// wrapper — so writer and reader share one definition rather than two that can drift.

export const COMMAND_INPUT_PREFIX = '{ :; ';
export const COMMAND_INPUT_SUFFIX = '\n} 2>&1; echo "';

// What a trailing pwd query writes. The reader recognizes it and leaves it out of a restored
// transcript entirely: it is bookkeeping the user never typed.
export const PWD_QUERY_PREFIX = 'pwd\necho "';

/**
 * One command and the delimiter that marks the end of its output.
 *
 * It is deliberately a *single logical line*: a brace group the shell has to read all the way to its
 * closing `}` — and past the `; echo` that follows on the same line — before it can run anything.
 * Written as two lines instead, the delimiter's `echo` would still be sitting unread in the shell's
 * input when the command starts, and a shell hands that input straight to the command it runs. A
 * command that reads its own stdin — a password prompt, a `read`, a REPL, anything promoted to a
 * terminal — then consumes the delimiter as its own input, so the delimiter never arrives and the
 * command never ends.
 *
 * The group runs in the current shell, so `cd`, variable assignments, and exit status are unchanged.
 * The leading `:` guards the empty and comment-only cases, which would otherwise make the group a
 * syntax error and take the delimiter's `echo` down with it.
 */
export function shellCommandInput(command: string, delimiter: string): string {
  return `${COMMAND_INPUT_PREFIX}${command}${COMMAND_INPUT_SUFFIX}${delimiter}"\n`;
}

export function shellPwdQueryInput(delimiter: string): string {
  return `${PWD_QUERY_PREFIX}${delimiter}"\n`;
}
