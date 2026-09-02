import { randomUUID } from 'node:crypto';
import type {
  ConversationsView,
  TabPluginActivation,
  TabPluginServerCapabilities,
} from '../api.js';
import {
  isChatPayload,
  isConversationsData,
  isEmptyIntent,
  isIdIntent,
  isSelectModelIntent,
  isSendIntent,
  type ChatPayload,
  type ChatTabPayload,
  type ConversationListPayload,
} from './shared.js';

const LIST_KEY = 'chat';

function listPayload(data: ConversationsView): ConversationListPayload {
  return { kind: 'list', entries: [...data.summaries] };
}

function chatPayload(data: ConversationsView, id: string): ChatTabPayload | undefined {
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
  const payload = chatPayload(dataFrom(capabilities), id);
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
    isPayload: isChatPayload,
    command: (argument, capabilities) => {
      const dock = parseDock(argument);
      if (dock !== undefined) {
        capabilities.openOrFocusTab(LIST_KEY, () => ({
          title: 'chat', payload: listPayload(dataFrom(capabilities)),
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
        const payload = chatPayload(event.data, key);
        if (payload) capabilities.updateTab(key, () => ({
          title: payload.conversation.title, payload,
        }));
      }
    },
    intent: (request, capabilities) => {
      if (!isChatPayload(request.tabPayload)) {
        return capabilities.reportFailure('invalid chat tab payload');
      }
      return runIntent(request.intent, request.payload, request.tabPayload, capabilities);
    },
    opener: {
      inline: (_file, capabilities) => capabilities.rejectRequest('chat opens no files'),
      external: (_file, capabilities) => capabilities.rejectRequest('chat opens no files'),
    },
  };
}

function runIntent(
  intent: string,
  value: unknown,
  tab: ChatPayload,
  capabilities: TabPluginServerCapabilities,
): null | never {
  if (intent === 'create') {
    if (tab.kind !== 'list' || !isEmptyIntent(value)) {
      return capabilities.rejectRequest('invalid create payload');
    }
    const id = randomUUID();
    capabilities.topicAction({ topic: 'conversations', action: 'create', id });
    const payload = chatPayload(dataFrom(capabilities), id);
    if (!payload) return capabilities.reportFailure('created conversation is unavailable');
    capabilities.openOrFocusTab(id, () => ({ title: 'New conversation', payload }));
    return null;
  }
  if (intent === 'open' || intent === 'delete') {
    if (tab.kind !== 'list' || !isIdIntent(value)) {
      return capabilities.rejectRequest(`invalid ${intent} payload`);
    }
    if (intent === 'open') openConversation(value.id, capabilities);
    else capabilities.topicAction({ topic: 'conversations', action: 'delete', id: value.id });
    return null;
  }
  if (tab.kind !== 'conversation') {
    return capabilities.rejectRequest(`invalid ${intent} payload`);
  }
  const id = tab.conversation.id;
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
    case 'select-model': {
      if (!isSelectModelIntent(value)) return capabilities.rejectRequest('invalid select-model payload');
      capabilities.topicAction({ topic: 'conversations', action: 'selectModel', id, ...value });
      return null;
    }
    default: {
      return capabilities.rejectRequest(`unknown chat intent "${intent}"`);
    }
  }
}
