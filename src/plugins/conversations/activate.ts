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
} from './shared.js';
import { ConversationTabs, dataFrom } from './tabs.js';

const LIST_KEY = 'conversations';

function listPayload(data: ConversationsView): ConversationListPayload {
  return { kind: 'list', entries: [...data.summaries] };
}

function parseDock(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}

export function activate(): TabPluginActivation {
  const tabs = new ConversationTabs();
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
      tabs.open(match.id, capabilities);
    },
    defaultMenuAction: (selection, capabilities) => {
      tabs.create(selection, capabilities);
    },
    notify: (event, capabilities) => {
      if (event.topic !== 'conversations' || !isConversationsData(event.data)) return;
      for (const key of event.tabs) {
        if (key === LIST_KEY) {
          capabilities.updateTab(key, () => ({ payload: listPayload(event.data) }));
        }
      }
      tabs.update(event.data, event.tabs, capabilities);
    },
    intent: (request, capabilities) => {
      if (!isConversationsPayload(request.tabPayload)) {
        return capabilities.reportFailure('invalid conversations tab payload');
      }
      return runIntent(request.intent, request.payload, request.tabPayload, capabilities, tabs);
    },
    dispose: () => { tabs.dispose(); },
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
  tabs: ConversationTabs,
): null | never {
  if (intent === 'create') {
    if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid create payload');
    tabs.create(undefined, capabilities);
    return null;
  }
  if (!isIdIntent(value)) return capabilities.rejectRequest(`invalid ${intent} payload`);
  if (intent === 'open') tabs.open(value.id, capabilities);
  else capabilities.topicAction({ topic: 'conversations', action: 'delete', id: value.id });
  return null;
}

const LIST_INTENTS = new Set(['create', 'open', 'delete']);

function runIntent(
  intent: string,
  value: unknown,
  tab: ConversationsPayload,
  capabilities: TabPluginServerCapabilities,
  tabs: ConversationTabs,
): null | never {
  if (LIST_INTENTS.has(intent)) {
    if (tab.kind !== 'list') return capabilities.rejectRequest(`invalid ${intent} payload`);
    return runListIntent(intent, value, capabilities, tabs);
  }
  if (tab.kind !== 'conversation') {
    return capabilities.rejectRequest(`invalid ${intent} payload`);
  }
  return runConversationIntent(intent, value, tab.conversation.id, capabilities, tabs);
}

function runConversationIntent(
  intent: string,
  value: unknown,
  id: string,
  capabilities: TabPluginServerCapabilities,
  tabs: ConversationTabs,
): null | never {
  switch (intent) {
    case 'consume-draft': {
      if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid consume-draft payload');
      tabs.consume(id, capabilities);
      return null;
    }
    case 'load-older': {
      if (!isEmptyIntent(value)) return capabilities.rejectRequest('invalid load-older payload');
      capabilities.topicAction({ topic: 'conversations', action: 'loadOlder', id });
      return null;
    }
    case 'send': {
      if (!isSendIntent(value)) return capabilities.rejectRequest('invalid send payload');
      tabs.consume(id, capabilities);
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
