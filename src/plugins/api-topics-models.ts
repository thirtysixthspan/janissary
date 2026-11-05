import type { ModelGroup } from '../models/groups.js';

export type ModelsTopicNotification = {
  topic: 'models';
  data: { groups: ModelGroup[]; refreshing: boolean };
  tabs: readonly string[];
};

export type ModelsTopicAction =
  | { topic: 'models'; action: 'reload' }
  | { topic: 'models'; action: 'refresh' }
  | { topic: 'models'; action: 'delete'; harness: string; id: string };

export type ModelsTopicDeleteAction = Extract<ModelsTopicAction, { action: 'delete' }>;
