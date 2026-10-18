import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type {
  TabPluginNotification,
  TabPluginNotificationTopic,
  TabPluginTopicAction,
} from './api.js';
import { tabActivityRows } from './activity.js';
import { scheduleTopicAction } from './schedule-topic-actions.js';
import { runscriptTopicAction } from './runscript-topic-actions.js';
import { readRunscriptRows } from '../schedule/system/runscript-rows.js';

const TABS_NOTIFICATION_WINDOW_MS = 100;

// Where each host topic comes from, what it carries, and what a plugin may ask the host to do to it.
// One entry per topic, so adding a topic is a data change here rather than a new branch anywhere
// else — the notification dispatcher, the `topicData` capability, and the `topicAction` capability
// all read this table.
type TopicSource = {
  subscribe(fire: () => void): Subscription;
  read(managers: Managers): TabPluginNotification['data'];
  act(managers: Managers, action: TabPluginTopicAction): string | undefined;
  empty: TabPluginNotification['data'];
};

function actOnConversations(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'conversations') return;
  switch (action.action) {
    // The draft the `Chat about this` entry pasted never reaches the record: it rides the tab
    // payload the activating plugin builds beside this call, so `create` stays id-only here.
    case 'create': { managers.conversations.create(action.id); return; }
    case 'load': { managers.conversations.load(action.id); return; }
    case 'loadOlder': { managers.conversations.loadOlder(action.id); return; }
    case 'send': {
      managers.conversations.send(action.id, action.query, action.context);
      return;
    }
    case 'cancel': { managers.conversations.cancel(action.id); return; }
    case 'openFiles': { managers.conversations.openFiles(action.id); return; }
    case 'launchShell': { managers.conversations.launchShell(action.id); return; }
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

// The three verbs that act on a tab this janissary holds. Each is refused unless a row both names the
// target and offers the verb, and each acts through the row that authorised it rather than looking
// the target up a second time.
function actOnSessionTab(managers: Managers, verb: 'detach' | 'focus' | 'close', label: string): void {
  const row = managers.sessions.offers(verb, { label });
  if (!row) return;
  if (verb === 'detach') managers.sessions.detach(row.label);
  else if (verb === 'focus') managers.sessions.focus(row.label);
  else managers.sessions.close(row.label);
}

// Every session action is refused unless a row both names the target and offers that verb, which
// keeps the grant as narrow as the list that motivates it: a plugin may do what the host already
// showed it could be done, and nothing else. Matching the name alone was wider — a recorded row's
// label belongs to no live tab, so `close` on one reached whatever tab happened to share the name.
//
// Each arm acts through the row that authorised it rather than looking the target up a second time.
function actOnSessions(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'sessions') return;
  switch (action.action) {
    case 'refresh': { managers.sessions.refresh(); return; }
    case 'detach': { actOnSessionTab(managers, 'detach', action.label); return; }
    case 'focus': { actOnSessionTab(managers, 'focus', action.label); return; }
    case 'close': { actOnSessionTab(managers, 'close', action.label); return; }
    case 'attach': {
      if (managers.sessions.offers('attach', { session: action.session })) {
        managers.sessions.attach(action.session);
      }
      return;
    }
    case 'terminate': {
      if (managers.sessions.offers('terminate', { session: action.session })) managers.sessions.terminate(action.session);
      return;
    }
    case 'forget': {
      if (managers.sessions.offers('forget', { session: action.session })) managers.sessions.forget(action.session);
      return;
    }
    // A read of the workspace the row's channel holds, so it is offered on every ready row of a live
    // channel and answers with the host's own `openSibling` rather than a manager of its own.
    case 'diff': {
      const row = managers.sessions.offers('diff', { label: action.label });
      if (row) void managers.plugins.openSibling('diff', { label: row.label, command: 'diff' });
    }
  }
}

// Focus the tab a `tabs` row names, refused for a label with no open tab — the same
// authorisation-by-current-state rule `sessions.focus` follows, checked against the manager's own
// tab list rather than against a payload the host remembers having delivered. It is also strictly
// narrower than a grant a plugin already holds: `dispatchLineWithOutput` reaches the application's
// whole command table, `close <name>` included, so being able to focus a tab by its label adds no
// reach a plugin did not already have.
function actOnTabs(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'tabs' || action.action !== 'focus') return;
  const index = managers.tab.findIndex(action.label);
  if (index === -1) return;
  managers.tab.setActiveTab(index);
}

// Every database-browser verb, each one delegated to the manager method that owns it. The request
// id the plugin minted rides through and is stamped on the answer; the emit is what carries that
// answer back, since `topicAction` returns nothing. One emit per action, whatever the action was —
// the rate is bounded by what a person did, not by how much data came back.
function actOnDatabases(managers: Managers, action: TabPluginTopicAction): void {
  if (action.topic !== 'databases') return;
  const database = managers.database;
  const id = action.requestId;
  switch (action.action) {
    case 'create': { database.browseCreate(action.database, id); break; }
    case 'schema': { database.browseSchema(action.database, id); break; }
    case 'query': { database.browseQuery(action.database, id, action.query); break; }
    case 'run': { database.browseRun(action.database, id, action.sql, action.returnsRows); break; }
    case 'updateCell': { database.browseUpdateCell(action.database, id, action.row, action.column, action.value); break; }
    case 'insertRow': { database.browseInsertRow(action.database, id, action.object, action.cells); break; }
    case 'deleteRow': { database.browseDeleteRow(action.database, id, action.row); break; }
    case 'export': { database.browseExport(action.database, id, action.query, action.format); break; }
  }
  messageBus.emit('databases', { type: 'changed' });
}

function subscribeTabs(fire: () => void): Subscription {
  let delivery: ReturnType<typeof setTimeout> | undefined;
  const listener = messageBus.on('state', 'dirty', () => {
    if (delivery !== undefined) return;
    delivery = setTimeout(() => {
      delivery = undefined;
      fire();
    }, TABS_NOTIFICATION_WINDOW_MS);
  });
  return {
    unsubscribe: () => {
      listener.unsubscribe();
      if (delivery !== undefined) clearTimeout(delivery);
      delivery = undefined;
    },
  };
}

const TOPIC_SOURCES: Record<TabPluginNotificationTopic, TopicSource> = {
  schedules: {
    subscribe: (fire) => messageBus.on('schedules', 'changed', fire),
    read: (managers) => managers.schedule.aggregatedView(),
    act: scheduleTopicAction,
    empty: [],
  },
  conversations: {
    subscribe: (fire) => messageBus.on('conversations', 'changed', fire),
    read: (managers) => managers.conversations.view(),
    act: (managers, action) => { actOnConversations(managers, action); },
    empty: { summaries: [], windows: [], models: [] },
  },
  sessions: {
    subscribe: (fire) => messageBus.on('sessions', 'changed', fire),
    read: (managers) => managers.sessions.view(),
    act: (managers, action) => { actOnSessions(managers, action); },
    empty: [],
  },
  databases: {
    subscribe: (fire) => messageBus.on('databases', 'changed', fire),
    read: (managers) => managers.database.readView(),
    act: (managers, action) => { actOnDatabases(managers, action); },
    empty: { databases: [], results: [], lastOpened: null },
  },
  tabs: {
    // The one topic that rides the raw state broadcast, because every display-relevant tab fact — a
    // focus, a badge, a dock, a title, an open, a close — ends there and nowhere else. The rows it
    // hands over are minute-rounded, so a republish is forced by a real change and not by every
    // transcript append.
    subscribe: subscribeTabs,
    read: (managers) => tabActivityRows(managers),
    act: (managers, action) => { actOnTabs(managers, action); },
    empty: [],
  },
  runscripts: {
    subscribe: (fire) => messageBus.on('runscripts', 'changed', fire),
    read: (managers) => readRunscriptRows(managers),
    act: (managers, action) => { runscriptTopicAction(managers, action); },
    empty: { rows: [] },
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

export function runTopicAction(managers: Managers, action: TabPluginTopicAction): string | undefined {
  return TOPIC_SOURCES[action.topic].act(managers, action);
}
