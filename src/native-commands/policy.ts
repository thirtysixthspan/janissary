import { resolveApplicationCommand } from '../application-commands.js';
import type { ApplicationCommandRow } from '../shared/application-commands.js';
import type { CommandSettingsSnapshot } from './settings-types.js';

export function disabledApplicationCommand(
  input: string,
  snapshot: CommandSettingsSnapshot | undefined,
): ApplicationCommandRow | undefined {
  const row = resolveApplicationCommand(input.replace(/^\//u, ''));
  if (!row) return undefined;
  const setting = snapshot?.commands.find((entry) => entry.name === row.name);
  return setting?.effectiveEnabled === false ? row : undefined;
}
