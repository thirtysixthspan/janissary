import { randomUUID } from 'node:crypto';
import type {
  ConversationsView,
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import {
  isConversationsPayload,
  isConversationsData,
  isEmptyIntent,
  isIdIntent,
  isRenameIntent,
  isSelectModelIntent,
  isSendIntent,
  type ConversationListPayload,
  type ConversationsPayload,
  type ConversationTabPayload,
} from './shared.js';

const LIST_KEY = 'conversations';

function listPayload(data: ConversationsView): ConversationListPayload {
  return { kind: 'list', entries: [...data.summaries] };
}

function conversationPayload(data: ConversationsView, id: string): ConversationTabPayload | undefined {
  const conversation = data.windows.find((window) => window.id === id);
  return conversation
    ? { kind: 'conversation', conversation, models: [...data.models] }
    : undefined;
}

function dataFrom(capabilities: TabPluginServerCapabilities): ConversationsView {
  const data = capabilities.topicData('conversations');
  if (!isConversationsData(data)) return capabilities.reportFailure('invalid conversations topic data');
  return data;
}

function openConversation(
  id: string,
  capabilities: TabPluginServerCapabilities,
): void {
  capabilities.topicAction({ topic: 'conversations', action: 'load', id });
  const payload = conversationPayload(dataFrom(capabilities), id);
  if (!payload) return capabilities.rejectRequest(`Conversation "${id}" not found`);
  capabilities.openOrFocusTab(id, () => ({ title: payload.conversation.title, payload }));
}

function parseDock(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isConversationsPayload,
    command: (argument, capabilities) => {
      const dock = parseDock(argument);
      if (dock !== undefined) {
        capabilities.openOrFocusTab(LIST_KEY, () => ({
          title: 'conversations', payload: listPayload(dataFrom(capabilities)),
        }));
        capabilities.dockTab(LIST_KEY, dock);
        return;
      }
      const title = argument.trim();
      const match = dataFrom(capabilities).summaries.find(
        (summary) => summary.title.toLowerCase() === title.toLowerCase(),
      );
      if (!match) return capabilities.rejectRequest(`No conversation matching "${title}".`);
      openConversation(match.id, capabilities);
    },
    notify: (event, capabilities) => {
      if (event.topic !== 'conversations' || !isConversationsData(event.data)) return;
      for (const key of event.tabs) {
        if (key === LIST_KEY) {
          capabilities.updateTab(key, () => ({ payload: listPayload(event.data) }));
          continue;
        }
        const payload = conversationPayload(event.data, key);
        if (payload) capabilities.updateTab(key, () => ({
          title: payload.conversation.title, payload,
        }));
      }
    },
    intent: (request, capabilities) => {
      if (!isConversationsPayload(request.tabPayload)) {
        return capabilities.reportFailure('invalid conversations tab payload');
      }
      return runIntent(request.intent, request.payload, request.tabPayload, capabilities);
    },
    opener: {
      inline: (_file, capabilities) => capabilities.rejectRequest('conversations opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('conversations opens no files'),
    },
  };
}

// The three intents the list tab raises. Kept apart from the conversation tab's own so neither
// dispatcher carries the other's guard about which kind of tab it is looking at.
function runListIntent(
  intent: string,
  value: unknown,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'create') {
    if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid create payload');
    const id = randomUUID();
    capabilities.topicAction({ topic: 'conversations', action: 'create', id });
    const payload = conversationPayload(dataFrom(capabilities), id);
    if (!payload) return capabilities.reportFailure('created conversation is unavailable');
    capabilities.openOrFocusTab(id, () => ({ title: 'New conversation', payload }));
    return null;
  }
  if (!isIdIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
  if (intent === 'open') openConversation(value.id, capabilities);
  else capabilities.topicAction({ topic: 'conversations', action: 'delete', id: value.id });
  return null;
}

const LIST_INTENTS = new Set(['create', 'open', 'delete']);

function runIntent(
  intent: string,
  value: unknown,
  tab: ConversationsPayload,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (LIST_INTENTS.has(intent)) {
    if (tab.kind !== 'list') return capabilities.rejectRequest(`invalid ${intent} payload`);
    return runListIntent(intent, value, capabilities);
  }
  if (tab.kind !== 'conversation') {
    return capabilities.rejectRequest(`invalid ${intent} payload`);
  }
  return runConversationIntent(intent, value, tab.conversation.id, capabilities);
}

function runConversationIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
): null | never {
  switch (intent) {
    case 'load-older': {
      if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid load-older payload');
      capabilities.topicAction({ topic: 'conversations', action: 'loadOlder', id });
      return null;
    }
    case 'send': {
      if (!isSendIntent(value)) return capabilities.rejectRequest('invalid send payload');
      capabilities.topicAction({ topic: 'conversations', action: 'send', id, query: value.query });
      return null;
    }
    case 'cancel': {
      if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid cancel payload');
      capabilities.topicAction({ topic: 'conversations', action: 'cancel', id });
      return null;
    }
    case 'open-files':
    case 'launch-agent': {
      if (!isEmptyIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
      const action = intent === 'open-files' ? 'openFiles' : 'launchAgent';
      capabilities.topicAction({ topic: 'conversations', action, id });
      return null;
    }
    case 'rename': {
      if (!isRenameIntent(value)) return capabilities.rejectRequest('invalid rename payload');
      capabilities.topicAction({ topic: 'conversations', action: 'rename', id, title: value.title });
      return null;
    }
    case 'select-model': {
      if (!isSelectModelIntent(value)) return capabilities.rejectRequest('invalid select-model payload');
      capabilities.topicAction({ topic: 'conversations', action: 'selectModel', id, ...value });
      return null;
    }
    default: {
      return capabilities.rejectRequest(`unknown conversations intent "${intent}"`);
    }
  }
}
