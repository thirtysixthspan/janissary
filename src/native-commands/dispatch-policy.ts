import { resolveApplicationCommand } from '../application-commands.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';

export function disabledCommandMessage(managers: Managers, command: string): string | undefined {
  if (command.startsWith('!')) return undefined;
  const row = resolveApplicationCommand(command);
  if (!row) return undefined;
  const snapshot = managers.nativeCommandSettings?.current();
  const setting = snapshot?.commands.find((entry) => entry.name === row.name);
  if (setting?.effectiveEnabled !== false) return undefined;
  return `Command is disabled: ${row.name}.`;
}

export function refuseDisabledCommand(
  managers: Managers,
  command: string,
  label: string,
): string | undefined {
  const message = disabledCommandMessage(managers, command);
  if (message === undefined) return undefined;
  notify(managers, 'command-disabled', label, message);
  return message;
}
