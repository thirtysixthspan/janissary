import type { TabPluginTopicAction } from './api-topics.js';
import type { ModelsTopicDeleteAction } from './api-topics-models.js';

export interface TabPluginTopicActionCapability {
  (action: ModelsTopicDeleteAction): Promise<string | undefined>;
  (action: Exclude<TabPluginTopicAction, ModelsTopicDeleteAction>): string | undefined;
  (action: TabPluginTopicAction): string | undefined | Promise<string | undefined>;
}
