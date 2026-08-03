import type { AggregatedScheduleView } from '../protocol.js';

export const TAB_PLUGIN_API_VERSION = 1;

// Additive changes keep this integer. A removal, rename, type tightening, payload-meaning change,
// or observable ordering change increments it and is a breaking change.
export type TabPluginCapabilityName =
  | 'note'
  | 'openOrFocusTab'
  | 'updateTab'
  | 'openClaimedFiles'
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
  openOrFocusTab: true,
  updateTab: true,
  openClaimedFiles: true,
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

export type TabPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  payloadSchemaVersion: number;
  tabLabelPrefix: string;
  fileExtensions: Readonly<Record<string, string | undefined>>;
  editGesture?: 'open external';
  command?: string;
  // Host topics this plugin wants to hear about. A declaration naming one must supply `notify`.
  notifications?: readonly TabPluginNotificationTopic[];
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
// strip alone, and there are no `TabPluginResources` because an update cannot register a new file.
export type TabPluginTabUpdate = {
  title?: string;
  payload: unknown;
};

export type TabPluginServerCapabilities = {
  note(text: string): void;
  openOrFocusTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginPayload): void;
  // Replace what one of this plugin's own tabs shows, addressed by the instance key it was opened
  // with. The tab keeps its label, position, group, focus, instance key, schema version, and served
  // files; only the payload, and the title when the factory returns one, change. An instance key
  // this plugin has no open tab for is a no-op, so a plugin never has to track which of its tabs
  // the user has since closed.
  updateTab(instanceKey: string, factory: () => TabPluginTabUpdate): void;
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
