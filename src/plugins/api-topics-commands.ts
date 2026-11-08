import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';

export type CommandsTopicNotification = {
  topic: 'commands';
  data: CommandSettingsSnapshot;
  tabs: readonly string[];
};

export type CommandsTopicAction =
  | { topic: 'commands'; action: 'refresh' }
  | { topic: 'commands'; action: 'set'; name: string; setting: 'enabled' | 'agentAccess'; value: boolean };

export type CommandsTopicSetAction = Extract<CommandsTopicAction, { action: 'set' }>;
