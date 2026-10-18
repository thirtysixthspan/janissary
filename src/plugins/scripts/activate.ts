import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
  type TabPluginTopicAction,
} from '../api.js';
import {
  isCreateIntent,
  isNameIntent,
  isScriptsPayload,
  type CreateIntent,
  type NameIntent,
} from './shared.js';

const TOPIC = 'runscripts';
const INSTANCE_KEY = 'scripts';
const TAB_TITLE = 'scripts';

function sendAction(
  capabilities: TabPluginServerCapabilities,
  action: (origin: string) => TabPluginTopicAction,
): null {
  const tab = capabilities.originTab();
  if (tab) capabilities.topicAction(action(tab.label));
  return null;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isScriptsPayload,
    command(_argument, capabilities) {
      const tab = capabilities.originTab();
      if (!tab) return;
      capabilities.topicAction({ topic: TOPIC, action: 'ensureDirectory', origin: tab.label });
      const data = capabilities.topicData(TOPIC);
      if (!isScriptsPayload(data)) return capabilities.reportFailure(`invalid ${TOPIC} topic data`);
      capabilities.openOrFocusTab(INSTANCE_KEY, () => ({ title: TAB_TITLE, payload: data }));
    },
    notify(event, capabilities) {
      if (event.topic !== TOPIC) return;
      const { data } = event;
      if (!isScriptsPayload(data)) return;
      capabilities.updateTab(INSTANCE_KEY, () => ({ payload: data }));
    },
    intent: defineIntents('scripts', isScriptsPayload, {
      execute: {
        payload: isNameIntent,
        run: (_tab, payload: NameIntent, capabilities) => sendAction(
          capabilities, (origin) => ({ topic: TOPIC, action: 'execute', name: payload.name, origin }),
        ),
      },
      delete: {
        payload: isNameIntent,
        run: (_tab, payload: NameIntent, capabilities) => sendAction(
          capabilities, (origin) => ({ topic: TOPIC, action: 'delete', name: payload.name, origin }),
        ),
      },
      clone: {
        payload: isNameIntent,
        run: (_tab, payload: NameIntent, capabilities) => sendAction(
          capabilities, (origin) => ({ topic: TOPIC, action: 'clone', name: payload.name, origin }),
        ),
      },
      create: {
        payload: isCreateIntent,
        run: (_tab, _payload: CreateIntent, capabilities) => sendAction(
          capabilities, (origin) => ({ topic: TOPIC, action: 'create', origin }),
        ),
      },
      open: {
        payload: isNameIntent,
        run: (_tab, payload: NameIntent, capabilities) => sendAction(
          capabilities, (origin) => ({ topic: TOPIC, action: 'open', name: payload.name, origin }),
        ),
      },
    }),
    opener: noFileOpener('scripts'),
  };
}
