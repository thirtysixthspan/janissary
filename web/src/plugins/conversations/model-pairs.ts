import type { ConversationModelPair } from '@shared/plugins/conversations/shared';

export function pairValue(harness: string, model: string): string {
  return `${harness}:${model}`;
}

export function pairFromValue(value: string): ConversationModelPair {
  const separator = value.indexOf(':');
  return {
    harness: value.slice(0, separator) as ConversationModelPair['harness'],
    model: value.slice(separator + 1),
  };
}

// The model list grouped into the optgroups the dropdown renders, one per harness that has models,
// in the fixed harness order.
export function modelGroups(models: ConversationModelPair[]): {
  harness: 'claude' | 'opencode';
  models: ConversationModelPair[];
}[] {
  return (['claude', 'opencode'] as const).map((harness) => ({
    harness,
    models: models.filter((pair) => pair.harness === harness),
  })).filter((group) => group.models.length > 0);
}
