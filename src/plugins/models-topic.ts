import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type { ModelsTopicAction, ModelsTopicNotification } from './api-topics-models.js';

export function readModelsTopic(managers: Managers): ModelsTopicNotification['data'] {
  return managers.models.view();
}

export function runModelsTopicAction(
  managers: Managers, action: ModelsTopicAction,
): string | undefined | Promise<string | undefined> {
  switch (action.action) {
    case 'reload': { managers.models.reload(); return; }
    case 'refresh': { void managers.models.refresh(); return; }
    case 'delete': { return managers.models.delete(action.harness, action.id); }
  }
}

export function subscribeModelsTopic(fire: () => void): Subscription {
  return messageBus.on('models', 'changed', fire);
}
