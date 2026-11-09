import type { DisabledApplicationCommand } from '../shared/application-commands.js';
import type { CommandSettingsSnapshot } from './settings-types.js';

export function projectDisabledApplicationCommands(
  snapshot: CommandSettingsSnapshot | undefined,
): DisabledApplicationCommand[] {
  return (snapshot?.commands ?? [])
    .filter(({ effectiveEnabled }) => !effectiveEnabled)
    .map(({ name, aliases, forms }) => ({ name, aliases, forms }));
}
