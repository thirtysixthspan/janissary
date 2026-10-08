import {
  defineIntents,
  noFileOpener,
  parseDockArgument,
  type ConversationsView,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
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
  type ConversationModelPair,
  type ConversationTabPayload,
  type ConversationsPayload,
} from './shared.js';
import { ConversationTabs, dataFrom } from './tabs.js';

const LIST_KEY = 'conversations';

function listPayload(data: ConversationsView): ConversationListPayload {
  return { kind: 'list', entries: [...data.summaries] };
}

export function activate(): TabPluginActivation {
  const tabs = new ConversationTabs();
  return {
    isPayload: isConversationsPayload,
    command: (argument, capabilities) => {
      const dock = parseDockArgument(argument);
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
    intent: defineIntents('conversations', isConversationsPayload, intentTable(tabs)),
    dispose: () => { tabs.dispose(); },
    opener: noFileOpener('conversations'),
  };
}

// Which kind of tab an intent belongs to. The list tab's intents never reach a conversation tab's
// and the other way round, and an entry's guard is what says so — the shared dispatcher answers a
// request raised from the wrong kind with the same `invalid <intent> payload` rejection a
// malformed payload gets.
const isListTab = (tab: ConversationsPayload): tab is ConversationListPayload => tab.kind === 'list';
const isConversationTab = (tab: ConversationsPayload): tab is ConversationTabPayload => tab.kind === 'conversation';

// The intents both tab kinds raise, in one table: the three the list tab raises, the three the
// conversation tab raises with a payload, and the four payload-free forwards that name a topic
// action for the conversation the tab already holds.
function intentTable(tabs: ConversationTabs) {
  return {
    create: {
      payload: isEmptyIntent,
      tab: isListTab,
      run: (_tab: ConversationListPayload, _value: Record<string, never>, capabilities: TabPluginServerCapabilities): null => {
        tabs.create(undefined, capabilities);
        return null;
      },
    },
    open: {
      payload: isIdIntent,
      tab: isListTab,
      run: (_tab: ConversationListPayload, value: { id: string }, capabilities: TabPluginServerCapabilities): null => {
        tabs.open(value.id, capabilities);
        return null;
      },
    },
    delete: {
      payload: isIdIntent,
      tab: isListTab,
      run: (_tab: ConversationListPayload, value: { id: string }, capabilities: TabPluginServerCapabilities): null => {
        capabilities.topicAction({ topic: 'conversations', action: 'delete', id: value.id });
        return null;
      },
    },
    send: {
      payload: isSendIntent,
      tab: isConversationTab,
      run: (tab: ConversationTabPayload, value: { query: string }, capabilities: TabPluginServerCapabilities): null => {
        const context = tabs.contextFor(tab.conversation.id);
        capabilities.topicAction({
          topic: 'conversations', action: 'send', id: tab.conversation.id, query: value.query, ...(context && { context }),
        });
        return null;
      },
    },
    rename: {
      payload: isRenameIntent,
      tab: isConversationTab,
      run: (tab: ConversationTabPayload, value: { title: string }, capabilities: TabPluginServerCapabilities): null => {
        capabilities.topicAction({ topic: 'conversations', action: 'rename', id: tab.conversation.id, title: value.title });
        return null;
      },
    },
    'select-model': {
      payload: isSelectModelIntent,
      tab: isConversationTab,
      run: (tab: ConversationTabPayload, value: ConversationModelPair, capabilities: TabPluginServerCapabilities): null => {
        capabilities.topicAction({ topic: 'conversations', action: 'selectModel', id: tab.conversation.id, ...value });
        return null;
      },
    },
    'load-older': forward('loadOlder'),
    cancel: forward('cancel'),
    'open-files': forward('openFiles'),
    'launch-shell': forward('launchShell'),
  };
}

// An intent that carries no payload and forwards one topic action, once its empty payload is
// confirmed: the payload guard and the tab-kind guard are the same two checks every other entry
// makes, so only the action it names is its own.
function forward(action: 'loadOlder' | 'cancel' | 'openFiles' | 'launchShell') {
  return {
    payload: isEmptyIntent,
    tab: isConversationTab,
    run: (tab: ConversationTabPayload, _value: Record<string, never>, capabilities: TabPluginServerCapabilities): null => {
      capabilities.topicAction({ topic: 'conversations', action, id: tab.conversation.id });
      return null;
    },
  };
}
