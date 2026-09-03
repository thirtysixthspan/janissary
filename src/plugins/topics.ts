import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type {
  TabPluginNotification,
  TabPluginNotificationTopic,
  TabPluginTopicAction,
} from './api.js';

// Where each host topic comes from, what it carries, and what a plugin may ask the host to do to it.
// One entry per topic, so adding a topic is a data change here rather than a new branch anywhere
// else — the notification dispatcher, the `topicData` capability, and the `topicAction` capability
// all read this table.
type TopicSource = {
  subscribe(fire: () => void): Subscription;
  read(managers: Managers): TabPluginNotification['data'];
  act(managers: Managers, action: TabPluginTopicAction): void;
  empty: TabPluginNotification['data'];
};

// Focus the tab a schedule row belongs to. Refused for a tab that owns no row, so the action stays
// "focus the owner of something I am already showing" rather than a way to focus any tab at all.
function focusScheduleOwner(managers: Managers, label: string): void {
  if (managers.schedule.aggregatedView().every((row) => row.tab !== label)) return;
  const index = managers.tab.findIndex(label);
  if (index !== -1) managers.tab.setActiveTab(index);
}

function actOnSchedules(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'schedules') return;
  switch (action.action) {
    case 'cancel': {
      managers.schedule.cancel(action.tab, action.id);
      return;
    }
    case 'clear': {
      managers.schedule.clearAll();
      return;
    }
    case 'focusOwner': {
      focusScheduleOwner(managers, action.tab);
    }
  }
}

function actOnConversations(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'conversations') return;
  switch (action.action) {
    case 'create': { managers.conversations.create(action.id); return; }
    case 'load': { managers.conversations.load(action.id); return; }
    case 'loadOlder': { managers.conversations.loadOlder(action.id); return; }
    case 'send': { managers.conversations.send(action.id, action.query); return; }
    case 'cancel': { managers.conversations.cancel(action.id); return; }
    case 'openFiles': { managers.conversations.openFiles(action.id); return; }
    case 'launchAgent': { managers.conversations.launchAgent(action.id); return; }
    case 'selectModel': {
      managers.conversations.selectModel(action.id, {
        harness: action.harness, model: action.model,
      });
      return;
    }
    case 'rename': { managers.conversations.rename(action.id, action.title); return; }
    case 'delete': { managers.conversations.delete(action.id); }
  }
}

const TOPIC_SOURCES: Record<TabPluginNotificationTopic, TopicSource> = {
  schedules: {
    subscribe: (fire) => messageBus.on('schedules', 'changed', fire),
    read: (managers) => managers.schedule.aggregatedView(),
    act: actOnSchedules,
    empty: [],
  },
  conversations: {
    subscribe: (fire) => messageBus.on('conversations', 'changed', fire),
    read: (managers) => managers.conversations.view(),
    act: actOnConversations,
    empty: { summaries: [], windows: [], models: [] },
  },
};

export function subscribeTopic(topic: TabPluginNotificationTopic, fire: () => void): Subscription {
  return TOPIC_SOURCES[topic].subscribe(fire);
}

export function readTopicData(
  managers: Managers, topic: TabPluginNotificationTopic,
): TabPluginNotification['data'] {
  return TOPIC_SOURCES[topic].read(managers);
}

export function emptyTopicData(
  topic: TabPluginNotificationTopic,
): TabPluginNotification['data'] {
  return TOPIC_SOURCES[topic].empty;
}

export function runTopicAction(managers: Managers, action: TabPluginTopicAction): void {
  TOPIC_SOURCES[action.topic].act(managers, action);
}
