import { getOutput } from '../commands.js';
import { commands } from '../commands/index.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { disabledApplicationCommand } from './policy.js';

export function disabledCommandMessage(
  managers: Managers,
  input: string,
  commandText: string,
): string | undefined {
  if (input.startsWith('!') || commandText.startsWith('!')) return undefined;
  const matched = commands.find((command) => command.match(commandText));
  if (!matched && getOutput(commandText).kind !== 'output') return undefined;
  const row = disabledApplicationCommand(commandText, managers.nativeCommandSettings?.current(), matched?.name);
  if (!row) return undefined;
  return `Command is disabled: ${row.name}.`;
}

export function refuseDisabledCommand(
  managers: Managers,
  input: string,
  commandText: string,
  label: string,
): string | undefined {
  const message = disabledCommandMessage(managers, input, commandText);
  if (message === undefined) return undefined;
  notify(managers, 'command-disabled', label, message);
  return message;
}
