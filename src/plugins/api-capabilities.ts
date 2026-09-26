// The capability half of the v1 tab plugin contract: what a plugin may ask the host to do, the set
// as data, the guard that admits a name, and the rejection one bad request raises. Split out of
// `api.ts` beside `api-topics.ts` and re-exported from it, so a plugin still imports the whole
// contract from one module.

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
