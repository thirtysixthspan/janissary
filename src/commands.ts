import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import agentNames from '../agent-names.json' with { type: 'json' };

export { agentNames };

export const availableCommands = [
  'dashboard',
  'settings',
  'about',
  'help',
  'state',
  'clear',
  'close',
  'hist',
  'quit',
  'agent',
];

let helpOutput: string | null = null;

function buildHelp(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const readmePath = join(__dirname, '..', 'README.md');
  try {
    const md = readFileSync(readmePath, 'utf-8');
    const cmdMatch = md.match(/### Commands[\s\S]*?(?=^## |^### |$(?![\s\S]))/m);
    const keyMatch = md.match(/### Key Bindings[\s\S]*?(?=^## |^### |$(?![\s\S]))/m);
    const cmdSection = cmdMatch ? cmdMatch[0].trim() : '';
    const keySection = keyMatch ? keyMatch[0].trim() : '';
    return cmdSection + '\n\n' + keySection;
  } catch {
    return 'Built-in: ' + availableCommands.join(', ') + '. Prefix a command with ` to run it in the shell, or / to run a built-in command. Press Ctrl+R or type hist to browse command history.';
  }
}

export const getOutput = (cmd: string): string | null => {
  const trimmed = cmd.trim().toLowerCase();

  if (trimmed === 'dashboard') return 'Welcome to the CLI dashboard.';
  if (trimmed === 'settings') return 'Settings panel — no settings yet.';
  if (trimmed === 'about') return 'Custom CLI built with Ink & React.';
  if (trimmed === 'help') {
    if (!helpOutput) helpOutput = buildHelp();
    return helpOutput;
  }
  if (trimmed === 'clear') return null;
  if (trimmed === 'state') return null;
  if (trimmed === 'hist') return null;
  if (trimmed === 'quit' || trimmed === 'exit' || trimmed === 'close') return null;
  if (trimmed.startsWith('agent')) return null;
  if (trimmed === 'next') return null;
  if (trimmed === '') return null;
  return `Unknown command: "${trimmed}". Type "help" for available commands.`;
};

export function resolveAgentName(
  input: string,
  existingLabels: string[],
): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^agent\s+(.+)/i);

  // `agent <name>` — use provided name (always lowercase)
  if (match) {
    return match[1].trim().toLowerCase();
  }

  // bare `agent` — pick random unused name from the pool (stored lowercase)
  const lowerExisting = existingLabels.map((l) => l.toLowerCase());
  const pool = agentNames.filter((n) => !lowerExisting.includes(n));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
