import { resolveApplicationCommand } from '../application-commands.js';
import type { ApplicationCommandRow } from '../shared/application-commands.js';
import type { CommandSettingsSnapshot } from './settings-types.js';

export type EffectiveCommandSetting = Readonly<{
  effectiveEnabled: boolean;
  effectiveAgentAccess: boolean;
}>;

export function effectiveCommandSetting(
  snapshot: CommandSettingsSnapshot | undefined,
  name: string,
): EffectiveCommandSetting {
  const row = snapshot?.commands.find((entry) => entry.name === name);
  return {
    effectiveEnabled: row?.effectiveEnabled ?? true,
    effectiveAgentAccess: row?.effectiveAgentAccess ?? true,
  };
}

export function disabledApplicationCommand(
  input: string,
  snapshot: CommandSettingsSnapshot | undefined,
  fallbackName?: string,
): ApplicationCommandRow | undefined {
  const row = resolveApplicationCommand(input.replace(/^\//u, ''))
    ?? (fallbackName === undefined ? undefined : resolveApplicationCommand(fallbackName));
  if (!row) return undefined;
  return effectiveCommandSetting(snapshot, row.name).effectiveEnabled ? undefined : row;
}
