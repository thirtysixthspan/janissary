import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';
import { commandSegments, SEGMENT_SEPARATORS } from './command-tokens.js';

// Programs whose need for a terminal was learned by watching them take one over, rather than by
// being on `interactive.ts`'s built-in list. Kept in `.janissary/interactive-commands.json` — beside
// `config.json` and deliberately *not* under `.janissary/state/`, which a normal launch deletes.
//
// The point is that detection costs at most one run per command: the first `mytui` is promoted
// mid-command by `interactive-signals.ts`, and every later one is recognized before it starts.
const FILE_NAME = 'interactive-commands.json';

// Far above any real project's TUI count; the oldest entries drop first.
const MAX_ENTRIES = 200;

let filePath = '';
let entries: string[] = [];
let lookup = new Set<string>();

function setEntries(next: string[]): void {
  entries = next;
  lookup = new Set(next);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Resolve and load the learned list for a project. A missing, unreadable, or malformed file loads
 * as empty and is left untouched on disk — a learned list is an optimization, never a reason to
 * fail a launch or discard a user's hand edits.
 */
export function loadLearnedCommands(projectDirectory: string): void {
  filePath = path.join(projectDirectory, '.janissary', FILE_NAME);
  if (!existsSync(filePath)) { setEntries([]); return; }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    setEntries(isStringArray(parsed) ? parsed : []);
  } catch {
    setEntries([]);
  }
}

// The learned keys, for `isInteractive` to match alongside its built-in names.
export function learnedCommands(): ReadonlySet<string> {
  return lookup;
}

// An argument narrows the key only when it reads as a subcommand: `git log` must not teach every
// `git` invocation to open a terminal, while a flag, a path, or a filename says nothing about the
// program's mode and is dropped (`mytui --watch` learns `mytui`, `vim notes.txt` learns `vim`).
function isSubcommand(argument: string): boolean {
  return !argument.startsWith('-') && !argument.includes('/') && !argument.includes('.');
}

/**
 * The key a command is remembered under, or `undefined` when it should not be remembered at all.
 * A command with several segments is skipped: output alone cannot say which of `git log | less`
 * took the screen, and guessing would teach the wrong program.
 */
export function learnedKey(command: string): string | undefined {
  if (SEGMENT_SEPARATORS.test(command)) return undefined;
  const [segment] = commandSegments(command);
  if (!segment) return undefined;
  const { program, argument } = segment;
  return argument && isSubcommand(argument) ? `${program} ${argument}` : program;
}

/**
 * Remember that `command` needed a terminal. Called only when detection promoted it — a manual
 * promotion is a one-off intent and does not teach the list.
 */
export function recordLearnedCommand(command: string): void {
  const key = learnedKey(command);
  if (!key || !filePath || lookup.has(key)) return;
  setEntries([...entries, key].slice(-MAX_ENTRIES));
  try {
    atomicWriteFile(filePath, JSON.stringify(entries, undefined, 2) + '\n');
  } catch {
    process.stderr.write(`warning: could not save .janissary/${FILE_NAME}\n`);
  }
}
