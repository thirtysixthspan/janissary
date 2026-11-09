import type { ApplicationCommandRow, ApplicationCommandSource } from '../shared/application-commands.js';

export type CommandSetting = Readonly<{ enabled: boolean; agentAccess: boolean }>;
export type CommandSettingsSource = ApplicationCommandSource;
export type CommandSettingsSnapshot = Readonly<{
  commands: readonly (ApplicationCommandRow & CommandSetting & {
    effectiveEnabled: boolean;
    effectiveAgentAccess: boolean;
  })[];
  source: CommandSettingsSource;
  path: string;
  problem?: string;
  overridden?: readonly string[];
}>;
export type CommandSettingsRead = Readonly<{
  values: Readonly<Record<string, CommandSetting>>;
  source: CommandSettingsSource;
  path: string;
  problem?: string;
  overridden?: readonly string[];
  unusablePath?: string;
}>;
export type CommandSettingsEdit = Readonly<{ name: string; setting: Partial<CommandSetting> }>;
