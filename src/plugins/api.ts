import type {
  TabPluginNotification, TabPluginNotificationTopic, TabPluginTopicAction,
} from './api-topics.js';
import type { TabPluginCapabilityName } from './api-capabilities.js';

// The capability half of the contract, and the topic half below it, live in modules of their own and
// are re-exported here, so a plugin still reads the whole v1 contract from one module.
export {
  TAB_PLUGIN_API_VERSION, TAB_PLUGIN_CAPABILITY_NAMES, isTabPluginCapability, TabPluginRejection,
} from './api-capabilities.js';
export type { TabPluginCapabilityName } from './api-capabilities.js';

export {
  TAB_PLUGIN_NOTIFICATION_TOPICS, isTabPluginNotificationTopic,
} from './api-topics.js';
export type {
  TabPluginNotification, TabPluginNotificationTopic, TabPluginTopicAction,
} from './api-topics.js';

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
  // Claims the `edit` command for the file types this plugin already claims, so `edit photo.png`
  // reaches the plugin's own editing presentation instead of the plain-text editor. A declaration
  // carrying it must supply an `edit` opener presentation.
  editsOwnFiles?: boolean;
  editGesture?: 'open external';
  command?: string;
  // Host topics this plugin wants to hear about. A declaration naming one must supply `notify`.
  notifications?: readonly TabPluginNotificationTopic[];
  // An entry the default context menu offers for a text selection. A declaration carrying one must
  // supply a `defaultMenuAction` handler.
  defaultMenu?: { label: string };
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

// The dock side a plugin's own command argument names, as the counterpart to `dockTab`: bare opens
// the list in the centre, `left` and `right` dock it into that sidebar, and anything else is
// `undefined` so the caller rejects the request rather than guessing a side the user did not name.
// Published here so every dockable list plugin reads one grammar instead of keeping a copy.
export function parseDockArgument(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}

export type TabPluginOpener = {
  inline(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  external(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // The `edit` presentation: the same file, opened for modification rather than for viewing.
  // Required only when the declaration sets `editsOwnFiles`.
  edit?(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
};

export type TabPluginPresentation = keyof TabPluginOpener;

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
  // Runs the entry the declaration contributed for the default context menu. Required only when
  // the declaration carries one. `selection` is the plain text the menu was offered against.
  defaultMenuAction?(selection: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
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

// The declared intent table lives beside the contract it completes; re-exported here so a plugin
// imports it from the same module as everything else in the contract.
export { defineIntents, type TabPluginIntentEntry } from './define-intents.js';

// The dockable-list command and notify pair, for the same reason and on the same terms as the intent
// table beside it: a plugin whose whole tab is one dockable list of records wrote both by hand.
export { defineDockableList, type DockableListOptions } from './define-list-tab.js';

export type TabPluginLoader = () => Promise<TabPluginActivationModule>;
export type TabPluginLoaders = Readonly<Record<string, TabPluginLoader>>;

export type { PluginFailedRequest, PluginIntentRequest, PluginTabView } from '../protocol.js';
// The two guards a plugin payload decoder opens with, re-exported for the same reason the protocol
// types above are: a plugin cannot import `../value-guards.js` across the plugin import boundary, and
// every bundled plugin's `shared.ts` had its own copy of both.
export { isModelPair, isRecord } from '../value-guards.js';
// Re-exported so a plugin can type a `schedules` notification handler without importing
// `../protocol.js`, which the plugin import boundary forbids.
export type {
  AggregatedScheduleView,
  ConversationModelPair,
  ConversationSummaryView,
  ConversationTurnView,
  ConversationWindowView,
  ConversationsView,
  RemoteSessionAction,
  RemoteSessionKind,
  RemoteSessionState,
  RemoteSessionView,
} from '../protocol.js';

// Resolution: core openers and commands resolve first, then one plugin contribution by exact
// extension or case-insensitive first token. Ordering: duplicate claims are rejected, so array
// position never breaks a tie. Async: each handler is awaited under its call budget and separate
// invocations may overlap. An empty return from an opener or a command means the handler completed
// without opening a tab; an intent must return a JSON-compatible value instead, since its result is
// sent to a waiting client. Failure: a `rejectRequest` throw answers one bad request; anything else
// disables the plugin.
