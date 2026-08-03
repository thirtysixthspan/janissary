import type { Managers } from '../managers.js';
import { messageBus, type Subscription } from '../bus.js';
import type {
  TabPluginActivation,
  TabPluginNotification,
  TabPluginNotificationTopic,
  TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';

// A notification handler does no I/O beyond reading the slice it was handed, so it gets a tighter
// budget than the 5000 ms a user-initiated opener, command, or intent runs under.
export const TAB_PLUGIN_NOTIFY_TIMEOUT_MS = 1000;

// Background work has no originating transcript. `note` no-ops when no tab matches its origin, so an
// empty label is what stops a notification from appending to a transcript the user never pointed at
// this plugin (see `createPluginContext`).
const BACKGROUND_ORIGIN: PluginFailureOrigin = { label: '', command: '' };

// Where each topic comes from and what it carries. One entry per topic, so adding a topic is a data
// change here rather than a new branch in the dispatch below.
type TopicSource = {
  subscribe(fire: () => void): Subscription;
  read(managers: Managers): TabPluginNotification['data'];
};

const TOPIC_SOURCES: Record<TabPluginNotificationTopic, TopicSource> = {
  schedules: {
    subscribe: (fire) => messageBus.on('schedules', 'changed', fire),
    read: (managers) => managers.schedule.aggregatedView(),
  },
};

// What the dispatcher needs from the host: its plugin records, the guarded-call path, and the way it
// disables a plugin. Passing these as functions keeps the delivery policy here and leaves the host
// holding only the subscription's lifetime.
export type TabPluginNotificationPort = {
  managers: Managers;
  records(): readonly PluginRecord[];
  timeoutMs: number;
  invoke(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => void | Promise<void>,
    timeoutMs: number,
  ): Promise<PluginCallOutcome<void>>;
  disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): void;
};

// The instance keys of the tabs this plugin currently owns. Empty means there is nothing to tell it
// about, which is also the test for whether to deliver at all.
function ownedTabs(managers: Managers, id: string): string[] {
  return managers.tab.tabs
    .filter((tab) => tab.plugin?.id === id)
    .map((tab) => tab.plugin!.instanceKey);
}

// A notification never activates a plugin: only one that is already active, still enabled, and
// already showing something can be told that the thing it is showing has moved on.
function subscribers(port: TabPluginNotificationPort, topic: TabPluginNotificationTopic) {
  return port.records().filter((record) =>
    record.state === 'active'
    && record.activation?.notify !== undefined
    && (record.declaration.notifications ?? []).includes(topic));
}

async function deliver(
  port: TabPluginNotificationPort,
  record: PluginRecord,
  event: TabPluginNotification,
): Promise<void> {
  const activation = record.activation;
  if (!activation?.notify) return;
  const outcome = await port.invoke(
    record,
    activation,
    BACKGROUND_ORIGIN,
    (capabilities) => activation.notify?.(event, capabilities),
    port.timeoutMs,
  );
  // A rejection has no caller to answer, so the only outcome that matters here is failure.
  if (outcome.status === 'failed') port.disable(record, outcome.error, BACKGROUND_ORIGIN);
}

// Fan out one topic to every subscriber concurrently: a notification cannot influence a host
// outcome, so nothing waits on it, and one slow plugin never delays another.
function dispatch(port: TabPluginNotificationPort, topic: TabPluginNotificationTopic): void {
  const records = subscribers(port, topic).filter(
    (record) => ownedTabs(port.managers, record.declaration.id).length > 0,
  );
  if (records.length === 0) return;
  const data = TOPIC_SOURCES[topic].read(port.managers);
  for (const record of records) {
    void deliver(port, record, {
      topic,
      data,
      tabs: ownedTabs(port.managers, record.declaration.id),
    });
  }
}

// Subscribes once per topic some declaration actually names, and returns the subscriptions for the
// host to release on dispose. A build in which no plugin subscribes to anything takes no
// subscription at all.
export function subscribeTabPluginNotifications(
  port: TabPluginNotificationPort,
  topics: Iterable<TabPluginNotificationTopic>,
): Subscription[] {
  return [...new Set(topics)].map((topic) =>
    TOPIC_SOURCES[topic].subscribe(() => { dispatch(port, topic); }));
}
