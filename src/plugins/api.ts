import type { AggregatedScheduleView } from '../protocol.js';

export const TAB_PLUGIN_API_VERSION = 1;

// Additive changes keep this integer. A removal, rename, type tightening, payload-meaning change,
// or observable ordering change increments it and is a breaking change.
export type TabPluginCapabilityName =
  | 'note'
  | 'notifyUser'
  | 'openOrFocusTab'
  | 'updateTab'
  | 'dockTab'
  | 'snapshotTab'
  | 'openClaimedFiles'
  | 'topicData'
  | 'topicAction'
  | 'configuredViewer'
  | 'openExternally'
  | 'rejectRequest'
  | 'reportFailure';

// The v1 capability set as data. Keyed by the union rather than written out as an array, so adding
// a name to `TabPluginCapabilityName` without listing it here is a compile error instead of a
// capability the host would then refuse as unknown. Used twice: to reject a declaration naming a
// capability v1 does not define, and to hold a plugin to the set its own manifest asked for.
const CAPABILITIES: Record<TabPluginCapabilityName, true> = {
  note: true,
  notifyUser: true,
  openOrFocusTab: true,
  updateTab: true,
  dockTab: true,
  snapshotTab: true,
  openClaimedFiles: true,
  topicData: true,
  topicAction: true,
  configuredViewer: true,
  openExternally: true,
  rejectRequest: true,
  reportFailure: true,
};

export const TAB_PLUGIN_CAPABILITY_NAMES = Object.keys(CAPABILITIES) as TabPluginCapabilityName[];

export function isTabPluginCapability(name: string): name is TabPluginCapabilityName {
  return Object.hasOwn(CAPABILITIES, name);
}

// Thrown by the `rejectRequest` capability. A rejection answers one bad request — a malformed intent
// payload, an unknown intent name, a missing command argument — and leaves the plugin running. It is
// deliberately distinct from `reportFailure`, which says the plugin itself can no longer be trusted
// and permanently disables it. Only the second one crosses the failure boundary.
export class TabPluginRejection extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TabPluginRejection';
  }
}

// Host state a plugin may ask to be told about. A topic is always a named, already-coalesced signal
// — never the raw state broadcast, which fires on essentially every mutation including per-keystroke
// shell output. Adding one is additive; each needs its own justification and its own data slice.
export type TabPluginNotificationTopic = 'schedules';

// Keyed by the union for the same reason `CAPABILITIES` is: a topic added to the type without a
// source here is a compile error rather than a name the host would silently never deliver.
const NOTIFICATION_TOPICS: Record<TabPluginNotificationTopic, true> = {
  schedules: true,
};

export const TAB_PLUGIN_NOTIFICATION_TOPICS =
  Object.keys(NOTIFICATION_TOPICS) as TabPluginNotificationTopic[];

export function isTabPluginNotificationTopic(name: string): name is TabPluginNotificationTopic {
  return Object.hasOwn(NOTIFICATION_TOPICS, name);
}

// One delivery of a host topic. `data` is the slice the host already computes for that topic, and
// `tabs` are the instance keys of this plugin's own open tabs — the host works that set out to
// decide whether to deliver at all, so passing it leaves the plugin with no bookkeeping of its own.
export type TabPluginNotification = {
  topic: 'schedules';
  data: readonly AggregatedScheduleView[];
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
  | { topic: 'schedules'; action: 'focusOwner'; tab: string };

export type TabPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  payloadSchemaVersion: number;
  tabLabelPrefix: string;
  fileExtensions: Readonly<Record<string, string | undefined>>;
  // Claims the `open` command's web branch — a target carrying an http/https scheme, or preceded by
  // the `page` keyword. The host decides what looks like a web address; the plugin decides what one
  // means, so the claim carries no normalization. First claimant wins, exactly as for an extension.
  webTargets?: boolean;
  editGesture?: 'open external';
  command?: string;
  // Host topics this plugin wants to hear about. A declaration naming one must supply `notify`.
  notifications?: readonly TabPluginNotificationTopic[];
  // An entry the file navigator offers for a multi-row selection of this plugin's own file types.
  // A declaration carrying one must supply a `selectionAction` handler.
  selectionAction?: TabPluginSelectionAction;
  capabilities: readonly TabPluginCapabilityName[];
};

export type TabPluginResources = {
  registerFile(absPath: string): string;
};

export type TabPluginPayload = {
  title: string;
  payload: unknown;
};

// What an `updateTab` factory returns. Deliberately not `TabPluginPayload`: the title is optional
// here, because a plugin changing only what a tab shows must be able to leave the name in the tab
// strip alone.
export type TabPluginTabUpdate = {
  title?: string;
  // A new instance key, for a tab whose identity is what it shows and whose subject has moved — an
  // embedded page navigating to another address. Omit it and the key stays as it was. A key another
  // open tab of the same plugin already holds is refused; the payload still applies, so a plugin
  // never has to handle half an update.
  instanceKey?: string;
  payload: unknown;
};

// What a plugin contributes for a whole selection of file navigator rows. The navigator offers it
// only when every selected row is a file whose extension this one declaration claims, so a plugin
// never sees a path it does not own. Deliberately a label and an action name and nothing else: the
// plugin describes the entry, the host decides when it is offered and resolves the paths.
export type TabPluginSelectionAction = {
  label: string;
  action: string;
};

export type TabPluginServerCapabilities = {
  note(text: string): void;
  // Report one line to the notifications feed, attributed to the tab the plugin was invoked from.
  // Deliberately text-only: a plugin may say that something happened and may not choose the event
  // type, the originating tab, or a deep link. The line is dropped when no notifications feed is
  // open, exactly as every other event is — plugin activity never conjures the feed into existence.
  notifyUser(text: string): void;
  openOrFocusTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginPayload): void;
  // Replace what one of this plugin's own tabs shows, addressed by the instance key it was opened
  // with. The tab keeps its label, position, group, focus, instance key, schema version, and the
  // files it is already serving; only the payload, and the title when the factory returns one,
  // change. An instance key this plugin has no open tab for is a no-op, so a plugin never has to
  // track which of its tabs the user has since closed.
  //
  // The factory receives the same `TabPluginResources` the `openOrFocusTab` one does, so an update
  // may begin serving a file the tab did not hold before — a playlist gaining a track. Every
  // reference it registers is recorded against the tab being updated, so closing that tab releases
  // what the update served exactly as it releases what the open served.
  updateTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginTabUpdate): void;
  // Dock one of this plugin's own tabs into a sidebar, or `null` to undock it back to the centre
  // strip and make it active. Addressed by instance key like `updateTab`, so a key with no open tab
  // is a silent no-op and a plugin can never move another plugin's tab.
  dockTab(instanceKey: string, dock: 'left' | 'right' | null): void;
  // Cache the text currently visible in one of this plugin's own tabs, so a monitor watching that
  // tab has something to feed on. The cache is server-only and is never broadcast to any client.
  // Addressed by instance key like `updateTab`, so a key with no open tab is a silent no-op and a
  // plugin can never write another plugin's snapshot.
  snapshotTab(instanceKey: string, text: string): void;
  // The data a declared topic carries, as of now. A notification says a topic changed; this is how a
  // plugin building a tab for the first time learns what the topic currently holds. Asking for a
  // topic this plugin did not declare is a plugin-authoring mistake and disables it.
  topicData(topic: TabPluginNotificationTopic): TabPluginNotification['data'];
  // Ask the host to perform one of the actions a declared topic defines.
  topicAction(action: TabPluginTopicAction): void;
  // Ask the host to run its ordinary `open` pipeline for `target`, restricted to this plugin's own
  // claimed extensions. The host queues the request and runs it after the guarded call returns, so
  // glob expansion and per-file dispatch never count against the plugin's own call budget.
  openClaimedFiles(target: string): void;
  configuredViewer(): string;
  openExternally(absPath: string, application?: string): boolean;
  rejectRequest(reason: string): never;
  reportFailure(reason: unknown): never;
};

export type TabPluginOpener = {
  inline(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  external(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
};

// The plugin-facing shape of one tab-scoped intent. Deliberately its own type rather than the wire
// request, so widening `pluginIntent` on the socket never silently widens the plugin contract.
export type TabPluginIntent = {
  tab: string;
  intent: string;
  payload: unknown;
  tabPayload: unknown;
};

export type TabPluginActivation = {
  opener: TabPluginOpener;
  // Runs the plugin's declared command with everything after the first token. Required only when the
  // declaration claims a command name.
  command?(argument: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // The result is sent to the waiting client, so it must be JSON-compatible. Unlike an opener or a
  // command, an intent may not fall off its last line: `undefined` is not JSON, so the host treats it
  // as an invalid produced result and disables the plugin. Return `null` when there is nothing to say.
  intent(request: TabPluginIntent, capabilities: TabPluginServerCapabilities): unknown | Promise<unknown>;
  // Called when a declared topic fires. Required only when the declaration names one. Its return
  // value is ignored — a notification reports that something happened and cannot influence any host
  // outcome; a plugin acts on it by calling `updateTab`.
  notify?(event: TabPluginNotification, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // Runs the entry the declaration contributed for a file navigator selection. Required only when
  // the declaration carries one. `paths` are absolute and were resolved by the host against the
  // navigator's own root, so a client can never name a file outside the tree it is browsing.
  selectionAction?(
    paths: readonly string[], capabilities: TabPluginServerCapabilities,
  ): void | Promise<void>;
  isPayload(value: unknown): boolean;
  dispose?(): void | Promise<void>;
};

export type TabPluginActivationModule = {
  activate(): TabPluginActivation | Promise<TabPluginActivation>;
};

export type TabPluginLoader = () => Promise<TabPluginActivationModule>;
export type TabPluginLoaders = Readonly<Record<string, TabPluginLoader>>;

export type { PluginFailedRequest, PluginIntentRequest, PluginTabView } from '../protocol.js';
// Re-exported so a plugin can type a `schedules` notification handler without importing
// `../protocol.js`, which the plugin import boundary forbids.
export type { AggregatedScheduleView } from '../protocol.js';

// Resolution: core openers and commands resolve first, then one plugin contribution by exact
// extension or case-insensitive first token. Ordering: duplicate claims are rejected, so array
// position never breaks a tie. Async: each handler is awaited under its call budget and separate
// invocations may overlap. An empty return from an opener or a command means the handler completed
// without opening a tab; an intent must return a JSON-compatible value instead, since its result is
// sent to a waiting client. Failure: a `rejectRequest` throw answers one bad request; anything else
// disables the plugin.
