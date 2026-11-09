import type { TabPluginTopicAction } from './api-topics.js';
import type { CommandsTopicSetAction } from './api-topics-commands.js';
import type { ModelsTopicDeleteAction } from './api-topics-models.js';

export type AwaitedTabPluginTopicAction = ModelsTopicDeleteAction | CommandsTopicSetAction;

export interface TabPluginTopicActionCapability {
  (action: AwaitedTabPluginTopicAction): Promise<string | undefined>;
  (action: Exclude<TabPluginTopicAction, AwaitedTabPluginTopicAction>): string | undefined;
  (action: TabPluginTopicAction): string | undefined | Promise<string | undefined>;
}

export function isAwaitedTopicAction(action: TabPluginTopicAction): action is AwaitedTabPluginTopicAction {
  return (action.topic === 'models' && action.action === 'delete')
    || (action.topic === 'commands' && action.action === 'set');
}

export function disabledTopicActionResult(
  action: TabPluginTopicAction,
): string | undefined | Promise<string | undefined> {
  return isAwaitedTopicAction(action) ? Promise.resolve(undefined) : undefined;
}
