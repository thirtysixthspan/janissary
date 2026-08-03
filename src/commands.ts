import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tabPluginCatalog } from './plugins/catalog.js';

export const coreAvailableCommands = [
  'help',
  'state',
  'clear',
  'close',
  'hist',
  'quit',
  'agent',
  'msg',
  'broadcast',
  'acp',
  'db',
  'connection',
  'harness',
  'ssh',
  'search',
  'files',
  'notifications',
  'notify',
  'syntax',
];

// `plugins` is a core command; every other addition here is contributed by a bundled tab plugin, so
// it comes from the catalog rather than a second hand-maintained list that could drift from it.
export const availableCommands = [
  ...coreAvailableCommands,
  'plugins',
  ...tabPluginCatalog.flatMap((plugin) => plugin.command ?? []),
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

export const getOutput = (command: string): string | null => {
  const trimmed = command.trim().toLowerCase();

  if (trimmed === 'help') {
    if (!helpOutput) helpOutput = buildHelp();
    return helpOutput;
  }
  if (trimmed === 'clear') return null;
  if (trimmed === 'state') return null;
  if (trimmed === 'hist') return null;
  if (['quit', 'exit', 'close'].includes(trimmed)) return null;
  if (trimmed.startsWith('agent')) return null;
  if (trimmed.startsWith('msg')) return null;
  if (trimmed.startsWith('broadcast')) return null;
  if (trimmed.startsWith('acp')) return null;
  if (/^db\b/.test(trimmed)) return null;
  if (/^connection\b/.test(trimmed)) return null;
  if (trimmed === 'next') return null;
  if (trimmed === '') return null;
  return `Unknown command: "${trimmed}". Type "help" for available commands.`;
};
