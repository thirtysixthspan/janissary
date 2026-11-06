import {
  defineDockableList,
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
} from '../api.js';
import type { ModelsTopicNotification } from '../api.js';
import {
  isDeleteIntent,
  isEmptyIntent,
  isModelsPayload,
  type DeleteIntent,
  type ModelsPayload,
} from './shared.js';

const INSTANCE_KEY = 'models';
const TAB_TITLE = 'models';
type SourceModelGroup = ModelsTopicNotification['data']['groups'][number];

function toPayload(data: ModelsTopicNotification['data']): ModelsPayload {
  return {
    groups: data.groups.map((group) => ({
      label: group.heading,
      rows: group.records.map((record) => ({
        harness: harnessFor(group),
        id: record.id,
        name: record.name,
        disabled: record.disabled === true,
      })),
    })),
    refreshing: data.refreshing,
  };
}

function harnessFor(group: SourceModelGroup): string {
  return group.key.startsWith('opencode:') ? 'opencode' : group.key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isSourceRecord(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.disabled === undefined || typeof value.disabled === 'boolean');
}

function isSourceGroup(value: unknown): value is SourceModelGroup {
  return isRecord(value)
    && typeof value.key === 'string'
    && typeof value.heading === 'string'
    && isUnknownArray(value.records)
    && value.records.every((record) => isSourceRecord(record));
}

function isModelsData(data: unknown): data is ModelsTopicNotification['data'] {
  return isRecord(data)
    && isUnknownArray(data.groups)
    && data.groups.every((group) => isSourceGroup(group))
    && typeof data.refreshing === 'boolean';
}

export function activate(): TabPluginActivation {
  const list = defineDockableList({
    topic: 'models',
    instanceKey: INSTANCE_KEY,
    title: TAB_TITLE,
    isData: isModelsData,
    toPayload,
  });

  return {
    isPayload: isModelsPayload,
    ...list,
    command(argument, capabilities) {
      capabilities.topicAction({ topic: 'models', action: 'reload' });
      list.command(argument, capabilities);
    },
    intent: defineIntents('models', isModelsPayload, {
      refresh: {
        payload: isEmptyIntent,
        run: (_tab, _payload: Record<string, never>, capabilities) => {
          capabilities.topicAction({ topic: 'models', action: 'refresh' });
          return null;
        },
      },
      delete: {
        payload: isDeleteIntent,
        run: async (_tab, payload: DeleteIntent, capabilities) => {
          const refusal = await capabilities.topicAction({
            topic: 'models', action: 'delete', harness: payload.harness, id: payload.id,
          });
          return refusal === undefined ? null : capabilities.rejectRequest(refusal);
        },
      },
    }),
    opener: noFileOpener('models'),
  };
}
