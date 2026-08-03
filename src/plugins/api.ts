export const TAB_PLUGIN_API_VERSION = 1;

// Additive changes keep this integer. A removal, rename, type tightening, payload-meaning change,
// or observable ordering change increments it and is a breaking change.
export type TabPluginCapabilityName =
  | 'note'
  | 'openOrFocusTab'
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

export type TabPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  payloadSchemaVersion: number;
  tabLabelPrefix: string;
  fileExtensions: Readonly<Record<string, string | undefined>>;
  editGesture?: 'open external';
  command?: string;
  capabilities: readonly TabPluginCapabilityName[];
};

export type TabPluginResources = {
  registerFile(absPath: string): string;
};

export type TabPluginPayload = {
  title: string;
  payload: unknown;
};

export type TabPluginServerCapabilities = {
  note(text: string): void;
  openOrFocusTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginPayload): void;
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
  intent(request: TabPluginIntent, capabilities: TabPluginServerCapabilities): unknown | Promise<unknown>;
  isPayload(value: unknown): boolean;
  dispose?(): void | Promise<void>;
};

export type TabPluginActivationModule = {
  activate(): TabPluginActivation | Promise<TabPluginActivation>;
};

export type TabPluginLoader = () => Promise<TabPluginActivationModule>;
export type TabPluginLoaders = Readonly<Record<string, TabPluginLoader>>;

export type { PluginFailedRequest, PluginIntentRequest, PluginTabView } from '../protocol.js';

// Resolution: core openers and commands resolve first, then one plugin contribution by exact
// extension or case-insensitive first token. Ordering: duplicate claims are rejected, so array
// position never breaks a tie. Async: each handler is awaited under its call budget and separate
// invocations may overlap. An empty return means the handler completed without opening a tab.
// Failure: a `rejectRequest` throw answers one bad request; anything else disables the plugin.
