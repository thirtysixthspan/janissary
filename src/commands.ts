import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from './commands/index.js';
import { RESERVED_NON_COMMAND_NAMES } from './commands/reserved.js';
import { readHelpPage } from './help-pages.js';

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

function helpDirectory(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', 'help');
}

function fallbackHelp(): string {
  return 'Built-in: ' + availableCommands.join(', ') + '. Prefix a command with "!" to run it in the shell, or / to run a built-in command. Press Ctrl+R or type hist to browse command history.';
}

// Bare `help` lists commands; named pages are read fresh so edits take effect without a restart.
function helpText(query: string | undefined): string {
  const result = readHelpPage(helpDirectory(), query ?? 'commands');
  if (result.kind === 'page') return result.text;
  if (result.kind === 'missing') return `No help for "${result.name}". Type "help" for available commands.`;
  return fallbackHelp();
}

// `help` with the section it names, if any; `undefined` for a command that is not `help` at all, such
// as `helper`.
function parseHelpCommand(command: string): { query: string | undefined } | undefined {
  const [word, ...rest] = command.split(/\s+/);
  if (word !== 'help') return undefined;
  return { query: rest.length > 0 ? rest.join(' ') : undefined };
}

// The one place this message is built. It used to be spelled two different ways — this full form in
// `getOutput`, and a shorter `Unknown command: "<x>".` at the tail of `capture/router.ts`.
export function unknownCommandMessage(command: string): string {
  return `Unknown command: "${command}". Type "help" for available commands.`;
}

// Only `help`, the empty string, and the unknown fallback are left. Every other name this used to
// answer `null` for — `clear`, `state`, `hist`, `quit`/`exit`/`close`,
// `acp`, `db`, `connection`, `next` — is a `Command` now, and both callers loop the registry before
// reaching here, so those branches were unreachable.
export const getOutput = (command: string): CommandOutput => {
  const trimmed = command.trim().toLowerCase();

  const help = parseHelpCommand(trimmed);
  if (help) return { kind: 'output', text: helpText(help.query) };
  // Still reachable: an empty message passes through the capture path's registry loop unmatched.
  if (trimmed === '') return { kind: 'silent' };
  return { kind: 'unknown', text: unknownCommandMessage(trimmed) };
};
