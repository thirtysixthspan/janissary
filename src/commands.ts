import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export { resolveAgentName, parseAgentCommand } from './agent-commands.js';

export const availableCommands = [
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

export {default as agentNames} from '../agent-names.json' with { type: 'json' };