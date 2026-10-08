import { resolveCommand } from '../resolve.js';
import { commands } from '../commands/index.js';
import type { Managers } from '../managers.js';

export function resolveInTab(input: string, label: string, managers: Managers) {
  return resolveCommand(input, (name) => commands.find((command) => command.name === name)
    ?.available?.(label, managers) ?? true);
}
