import type {
  AggregatedScheduleView,
  ConversationsView,
  RemoteSessionView,
  VisualizationsView,
} from '../protocol.js';

// The topic half of the v1 tab plugin contract: the host topics a plugin may declare an interest in,
// the shape of one delivery, and the actions it may ask the host to perform on them. Split out of
// `api.ts` beside `define-intents.ts` and re-exported from it, so a plugin still imports the whole
// contract — capabilities, declaration, activation — from one module.

// Host state a plugin may ask to be told about. A topic is always a named, already-coalesced signal
// — never the raw state broadcast, which fires on essentially every mutation including per-keystroke
// shell output. Adding one is additive; each needs its own justification and its own data slice.
export type TabPluginNotificationTopic =
  | 'schedules' | 'conversations' | 'sessions' | 'visualizations';

// Keyed by the union for the same reason `CAPABILITIES` is: a topic added to the type without a
// source here is a compile error rather than a name the host would silently never deliver.
const NOTIFICATION_TOPICS: Record<TabPluginNotificationTopic, true> = {
  schedules: true,
  conversations: true,
  sessions: true,
  visualizations: true,
};

export const TAB_PLUGIN_NOTIFICATION_TOPICS =
  Object.keys(NOTIFICATION_TOPICS) as TabPluginNotificationTopic[];

export function isTabPluginNotificationTopic(name: string): name is TabPluginNotificationTopic {
  return Object.hasOwn(NOTIFICATION_TOPICS, name);
}

// One delivery of a host topic. `data` is the slice the host already computes for that topic, and
// `tabs` are the instance keys of this plugin's own open tabs — the host works that set out to
// decide whether to deliver at all, so passing it leaves the plugin with no bookkeeping of its own.
export type TabPluginNotification =
  | {
    topic: 'schedules';
    data: readonly AggregatedScheduleView[];
    tabs: readonly string[];
  }
  | {
    topic: 'conversations';
    data: ConversationsView;
    tabs: readonly string[];
  }
  | {
    topic: 'sessions';
    data: readonly RemoteSessionView[];
    tabs: readonly string[];
  }
  | {
    topic: 'visualizations';
    data: VisualizationsView;
    tabs: readonly string[];
  };

// What a plugin may ask the host to do to a topic it declared an interest in. Deliberately tied to a
// topic rather than offered as free-standing capabilities: a plugin may act only on state the host
// already agreed to show it, which keeps the grant as narrow as the view that motivates it. Each
// topic names its own actions, so adding a topic never widens what an existing one can do.
export type TabPluginTopicAction =
  | { topic: 'schedules'; action: 'cancel'; tab: string; id: string }
  | { topic: 'schedules'; action: 'clear' }
  // Focus the tab a row belongs to. Refused for a tab that owns no row in the topic's current data,
  // so this stays "focus the owner of what I am showing" rather than a general focus-anything grant.
  | { topic: 'schedules'; action: 'focusOwner'; tab: string }
  | { topic: 'conversations'; action: 'create'; id: string }
  | { topic: 'conversations'; action: 'load'; id: string }
  | { topic: 'conversations'; action: 'loadOlder'; id: string }
  // The send the conversation tab raises. The optional context is a selection the conversations
  // plugin captured for this tab — the `Chat about this` draft — which the responder folds into the
  // prompt text rather than recording anywhere.
  | { topic: 'conversations'; action: 'send'; id: string; query: string; context?: string }
  | { topic: 'conversations'; action: 'cancel'; id: string }
  | { topic: 'conversations'; action: 'openFiles'; id: string }
  | { topic: 'conversations'; action: 'launchAgent'; id: string }
  | {
    topic: 'conversations';
    action: 'selectModel';
    id: string;
    harness: 'claude' | 'opencode';
    model: string;
  }
  // The title the user typed over the conversation's own. Trimmed, capped, and refused when empty by
  // the manager, so a plugin cannot leave a conversation nameless.
  | { topic: 'conversations'; action: 'rename'; id: string; title: string }
  | { topic: 'conversations'; action: 'delete'; id: string }
  // The four things a session row offers, plus the two a row that cannot be parked offers instead.
  // Addressed by tab label or by session id depending on what the verb acts on: `detach`, `focus`,
  // and `close` act on a tab this janissary holds, while `attach`, `terminate`, and `forget` act on a
  // session that may have no tab at all. Every one is refused unless a row in the topic's current
  // data both names the target *and* offers that verb — presence alone is not enough, since a
  // recorded row's label is a name belonging to no live tab and would otherwise let `close` reach
  // whatever tab happened to share it.
  | { topic: 'sessions'; action: 'detach' | 'focus' | 'close'; label: string }
  | { topic: 'sessions'; action: 'attach' | 'terminate' | 'forget'; session: string }
  // Re-read local state and rebuild the rows. It opens no ssh connection: reachability is learned
  // only by pressing attach or terminate.
  | { topic: 'sessions'; action: 'refresh' }
  // The whole lifecycle of one visualization, and nothing else. The plugin never fetches a source,
  // never parses one, and never speaks to a model: it names what the user said and the host does all
  // of it, which is why a message and a chart id are the only new facts it can introduce. A `create`
  // may carry the first message, which is what the default menu's **Visualize this** sends, so a
  // selection becomes the opening turn rather than a field the tab has to offer.
  | { topic: 'visualizations'; action: 'create'; id: string; message?: string }
  | { topic: 'visualizations'; action: 'load'; id: string }
  | { topic: 'visualizations'; action: 'delete'; id: string }
  // A message, and the one cancellation that covers the model call it starts.
  | { topic: 'visualizations'; action: 'send'; id: string; query: string }
  | { topic: 'visualizations'; action: 'cancel'; id: string }
  // Taking back what one turn did to the charts, named by where the turn sits rather than by what it said:
  // two turns can carry the same sentence, whether re-sent or clicked twice from a re-offered row, and only
  // a position tells them apart.
  | { topic: 'visualizations'; action: 'undo'; id: string; index: number }
  // One chart's live-update interval, and the one-shot re-read of one chart's data. Both name a chart
  // rather than a visualization because live update belongs to an individual graph, and on a chart
  // whose data the agent acquired the second is a model call.
  | { topic: 'visualizations'; action: 'setChartRefresh'; id: string; chartId: string; seconds: number }
  | { topic: 'visualizations'; action: 'refreshChart'; id: string; chartId: string };
