import type { CommandSettingName } from './shared.js';

export const COMMANDS_USAGE = 'Usage: commands [enable|disable [agent|global] <command>].';

export type CommandNameRow = {
  name: string;
  aliases: readonly string[];
  forms: readonly string[];
};

export type CommandParse =
  | { kind: 'open' }
  | { kind: 'edit'; name: string; setting: CommandSettingName; value: boolean }
  | { kind: 'error'; message: string };

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

function typedText(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ');
}

function error(message: string): CommandParse {
  return { kind: 'error', message };
}

export function parseCommand(argument: string, rows: readonly CommandNameRow[]): CommandParse {
  const typed = typedText(argument);
  if (typed.length === 0) return { kind: 'open' };
  const words = typed.split(' ');
  const verb = words[0].toLowerCase();
  if (verb !== 'enable' && verb !== 'disable') return error(COMMANDS_USAGE);
  const rest = words.slice(1);
  if (rest.length === 0) return error(COMMANDS_USAGE);
  const first = rest[0].toLowerCase();
  if (first === 'global' && rest.length === 1) return error(COMMANDS_USAGE);
  const selected = (first === 'agent' || first === 'global') && rest.length >= 2;
  const setting: CommandSettingName = selected && first === 'agent' ? 'agentAccess' : 'enabled';
  const nameText = (selected ? rest.slice(1) : rest).join(' ');
  const normalized = normalize(nameText);
  const row = rows.find((candidate) => [candidate.name, ...candidate.aliases, ...candidate.forms]
    .some((form) => normalize(form) === normalized));
  if (!row) return error(`Unknown application command: ${nameText}.`);
  return { kind: 'edit', name: row.name, setting, value: verb === 'enable' };
}
