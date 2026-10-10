import type {
  AggregatedScheduleView,
  ConversationsView,
  DatabasesView,
  TabActivityEntry,
} from './api.js';
import type { DatabaseGridQuery, RemoteSessionView } from '../protocol.js';

// The topic half of the v1 tab plugin contract: the host topics a plugin may declare an interest in,
// the shape of one delivery, and the actions it may ask the host to perform on them. Split out of
// `api.ts` beside `define-intents.ts` and re-exported from it, so a plugin still imports the whole
// contract — capabilities, declaration, activation — from one module.

// Host state a plugin may ask to be told about. A topic is always a named, already-coalesced signal
// — never the raw state broadcast, which fires on essentially every mutation including per-keystroke
// shell output. Adding one is additive; each needs its own justification and its own data slice.
//
// `tabs` is the one exception to the coalescing rule, and deliberately so: a tail's display state
// genuinely changes on the raw state broadcast, because that is what a focus, a badge, a dock, a
// title, and a tab opening or closing all end in. It pays for that with the tightest rows of any
// topic — last activity is minute-rounded, so two transcript appends inside one minute report the
// same value — and its subscriber is expected to drop a republish whose rows have not moved, which
// is what keeps a per-mutation signal from becoming a per-mutation broadcast.
export type TabPluginNotificationTopic =
  | 'schedules' | 'conversations' | 'sessions' | 'databases' | 'tabs';

// Keyed by the union for the same reason `CAPABILITIES` is: a topic added to the type without a
// source here is a compile error rather than a name the host would silently never deliver.
const NOTIFICATION_TOPICS: Record<TabPluginNotificationTopic, true> = {
  schedules: true,
  conversations: true,
  sessions: true,
  databases: true,
  tabs: true,
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
  // The databases a plugin may browse, and the recent answers to the requests it has issued against
  // them. The answers are what a topic action cannot return, since `topicAction` is fire-and-forget:
  // each one carries the `requestId` the plugin minted with its action, and the plugin folds the
  // matching one into its tab when this arrives.
  | {
    topic: 'databases';
    data: DatabasesView;
    tabs: readonly string[];
  }
  // Every tab the host has open, in strip order, as the rows a launcher-style view shows. It is the
  // only topic whose data is the application's whole tab set rather than one subsystem's slice, so it
  // is also the only one whose subscriber must drop an unchanged republish.
  | {
    topic: 'tabs';
    data: readonly TabActivityEntry[];
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
  | { topic: 'conversations'; action: 'launchShell'; id: string }
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
  // Focus one of the host's open tabs, refused for a label with no open tab. It is the only way a
  // plugin client reaches a tab it does not own, because the client RPC surface a plugin is given is
  // its own intent function and nothing else. Refusing an unknown label rather than a row it was not
  // shown is the same authorisation rule `sessions.focus` follows — checked against the manager's
  // own current rows — and it is strictly narrower than the `dispatchLineWithOutput` grant, whose
  // command table already holds `close <name>`.
  | { topic: 'tabs'; action: 'focus'; label: string }
  // The nine verbs the database browser may ask the host for. Each names a database and the
  // `requestId` its answer will arrive under; the four write-shaped ones carry an opaque row key and
  // column/value pairs, never SQL, so a plugin cannot compose a statement of its own. `run` is the
  // one exception and is deliberately so — it is the SQL console, whose whole purpose is to run
  // what the user typed.
  | { topic: 'databases'; action: 'create'; database: string; requestId: string }
  | { topic: 'databases'; action: 'schema'; database: string; requestId: string }
  | { topic: 'databases'; action: 'query'; database: string; requestId: string; query: DatabaseGridQuery }
  | { topic: 'databases'; action: 'run'; database: string; requestId: string; sql: string; returnsRows: boolean }
  | {
    topic: 'databases';
    action: 'updateCell';
    database: string;
    requestId: string;
    row: string;
    column: string;
    value: string | null;
  }
  | {
    topic: 'databases';
    action: 'insertRow';
    database: string;
    requestId: string;
    object: string;
    cells: { column: string; value: string | null }[];
  }
  | { topic: 'databases'; action: 'deleteRow'; database: string; requestId: string; row: string }
  | {
    topic: 'databases';
    action: 'export';
    database: string;
    requestId: string;
    query: DatabaseGridQuery;
    format: 'csv' | 'json';
  };
