import type { Managers } from '../managers.js';
import type { TabPluginTopicAction } from './api-topics.js';
import type { CommandsTopicSetAction } from './api-topics-commands.js';
import type { ModelsTopicDeleteAction } from './api-topics-models.js';

export type AwaitedTabPluginTopicAction = ModelsTopicDeleteAction | CommandsTopicSetAction;

export interface TabPluginTopicActionCapability {
  (action: AwaitedTabPluginTopicAction): Promise<string | undefined>;
  (action: Exclude<TabPluginTopicAction, AwaitedTabPluginTopicAction>): string | undefined;
  (action: TabPluginTopicAction): string | undefined | Promise<string | undefined>;
}

export interface RunTopicAction {
  (managers: Managers, action: AwaitedTabPluginTopicAction): Promise<string | undefined>;
  (managers: Managers, action: Exclude<TabPluginTopicAction, AwaitedTabPluginTopicAction>): string | undefined;
  (managers: Managers, action: TabPluginTopicAction): string | undefined | Promise<string | undefined>;
}
