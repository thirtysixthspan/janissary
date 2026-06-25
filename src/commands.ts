import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import agentNames from '../agent-names.json' with { type: 'json' };
import type { AgentCommand } from './types.js';



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
];

let helpOutput: string | null = null;

function buildHelp(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const readmePath = join(__dirname, '..', 'README.md');
  try {
    const md = readFileSync(readmePath, 'utf8');
    const commandMatch = md.match(/### Commands[\s\S]*?(?=^## |^### |$(?![\s\S]))/m);
    const keyMatch = md.match(/### Key Bindings[\s\S]*?(?=^## |^### |$(?![\s\S]))/m);
    const commandSection = commandMatch ? commandMatch[0].trim() : '';
    const keySection = keyMatch ? keyMatch[0].trim() : '';
    return commandSection + '\n\n' + keySection;
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
  const lowerExisting = new Set(existingLabels.map((l) => l.toLowerCase()));
  const pool = agentNames.filter((n) => !lowerExisting.has(n));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Parse a full `agent` command string into its name and flags.
 * Accepts: `agent`, `agent <name>`, `agent <name> --workspace`, `agent <name> -w`,
 * `agent --workspace`, `agent -w`.
 * Flags are stripped; the name is returned lowercased (empty string means bare agent).
 */
export function parseAgentCommand(input: string): AgentCommand {
  const trimmed = input.trim();
  const isWorkspace = /\s(-w|--workspace)\b/i.test(trimmed);
  const stripped = trimmed.replaceAll(/\s+(-w|--workspace)\s*/gi, ' ').trim();
  const nameMatch = stripped.match(/^agent\s+(.+)/i);
  return {
    name: nameMatch ? nameMatch[1].trim().toLowerCase() : '',
    workspace: isWorkspace,
  };
}

export {default as agentNames} from '../agent-names.json' with { type: 'json' };