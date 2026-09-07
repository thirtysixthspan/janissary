import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from './commands/index.js';
import { RESERVED_NON_COMMAND_NAMES } from './commands/reserved.js';

// What the classifier decided, rather than three meanings folded into `string | null` and told
// apart by the leading words of a user-facing message. Two callers used to recover the third case
// with their own `startsWith('Unknown command:')` test, which made rewording the message — a plain
// copy edit — silently reclassify every unrecognized command as a known one carrying output.
export type CommandOutput =
  | { kind: 'output'; text: string }
  | { kind: 'silent' }
  | { kind: 'unknown'; text: string };

// Derived from the registry rather than hand-listed beside it: the hand-written list had drifted,
// omitting more than a dozen registered commands. `help` is the one built-in with no `Command`
// entry, so it is the only name still supplied from outside the registry.
export const availableCommands = [
  ...RESERVED_NON_COMMAND_NAMES,
  ...commands.map((command) => command.name),
];

let helpOutput: string | null = null;

function buildHelp(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const helpPath = path.join(__dirname, '..', 'help.md');
  try {
    return readFileSync(helpPath, 'utf8').trim();
  } catch {
    return 'Built-in: ' + availableCommands.join(', ') + '. Prefix a command with "shell " to run it in the shell, or / to run a built-in command. Press Ctrl+R or type hist to browse command history.';
  }
}

// The one place this message is built. It used to be spelled two different ways — this full form in
// `getOutput`, and a shorter `Unknown command: "<x>".` at the tail of `capture/router.ts`.
export function unknownCommandMessage(command: string): string {
  return `Unknown command: "${command}". Type "help" for available commands.`;
}

// Only `help`, the empty string, and the unknown fallback are left. Every other name this used to
// answer `null` for — `clear`, `state`, `hist`, `quit`/`exit`/`close`, `agent`, `msg`, `broadcast`,
// `acp`, `db`, `connection`, `next` — is a `Command` now, and both callers loop the registry before
// reaching here, so those branches were unreachable.
export const getOutput = (command: string): CommandOutput => {
  const trimmed = command.trim().toLowerCase();

  if (trimmed === 'help') {
    if (!helpOutput) helpOutput = buildHelp();
    return { kind: 'output', text: helpOutput };
  }
  // Still reachable: an empty message passes through the capture path's registry loop unmatched.
  if (trimmed === '') return { kind: 'silent' };
  return { kind: 'unknown', text: unknownCommandMessage(trimmed) };
};
