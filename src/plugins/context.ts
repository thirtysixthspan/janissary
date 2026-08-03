import type { Managers } from '../managers.js';
import { getConfig } from '../config.js';
import { didOsOpen } from '../openers/os-open.js';
import {
  TAB_PLUGIN_CAPABILITY_NAMES,
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginNotificationTopic,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import { readTopicData, runTopicAction } from './topics.js';

export function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, seen))
    : Object.values(value).every((item) => isJsonCompatible(item, seen));
  seen.delete(value);
  return valid;
}

// Holds a plugin to the capability set its own manifest asked for. Without this the `capabilities`
// field is decorative: every plugin receives the whole context regardless of what it declared, so
// an under-declared manifest keeps working and the declaration stops describing anything. Reaching
// past the declaration is a plugin-authoring mistake rather than a bad request from a caller, so it
// throws an ordinary error and crosses the failure boundary like any other broken plugin.
function restrictToDeclared(
  capabilities: TabPluginServerCapabilities,
  declared: readonly TabPluginCapabilityName[],
): TabPluginServerCapabilities {
  const granted = new Set<string>(declared);
  const restricted = { ...capabilities };
  for (const capability of TAB_PLUGIN_CAPABILITY_NAMES) {
    if (granted.has(capability)) continue;
    restricted[capability] = () => {
      throw new Error(`used capability "${capability}" without declaring it`);
    };
  }
  return restricted;
}

// The checks a plugin-produced tab value must pass, shared by the creation and update paths so a
// payload can never enter a tab through one route under weaker rules than the other. A title is
// checked only when there is one: creation always supplies it, an update may leave it alone.
function validateTabValue(
  activation: TabPluginActivation,
  value: { title?: string; payload: unknown },
): void {
  if (value.title !== undefined && !value.title.trim()) throw new Error('produced an empty tab title');
  if (!activation.isPayload(value.payload) || !isJsonCompatible(value.payload)) {
    throw new Error('produced an invalid tab payload');
  }
}

// Reading or acting on a topic the manifest never named reaches past the declaration exactly as
// using an undeclared capability does, so it fails the same way: an ordinary error across the
// failure boundary rather than a rejection the caller could have avoided.
function requireDeclaredTopic(
  declaration: TabPluginDeclaration,
  topic: TabPluginNotificationTopic,
): void {
  if (!(declaration.notifications ?? []).includes(topic)) {
    throw new Error(`used topic "${topic}" without declaring it`);
  }
}

export function createPluginContext(
  managers: Managers,
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  origin: PluginFailureOrigin,
  isEnabled: () => boolean,
  // Collects `openClaimedFiles` targets for the host to run once the guarded call has returned.
  openRequests: string[] = [],
): TabPluginServerCapabilities {
  return restrictToDeclared({
    note: (text) => {
      if (!isEnabled()) return;
      if (managers.tab.tabs.some((tab) => tab.label === origin.label)) {
        managers.tab.append(origin.label, { input: origin.command, output: text });
      }
    },
    openOrFocusTab: (instanceKey, factory) => {
      if (!isEnabled()) return;
      if (managers.tab.tabs.every((tab) => tab.label !== origin.label)) return;
      managers.tab.openPluginTab(
        declaration.id,
        declaration.tabLabelPrefix,
        instanceKey,
        declaration.payloadSchemaVersion,
        origin.label,
        (resources) => {
          const created = factory(resources);
          validateTabValue(activation, created);
          return created;
        },
      );
    },
    // Unlike `openOrFocusTab`, this does not require the originating tab to still exist: the target
    // is the plugin's own tab, not the transcript that asked for the change.
    updateTab: (instanceKey, factory) => {
      if (!isEnabled()) return;
      managers.tab.updatePluginTab(declaration.id, instanceKey, () => {
        const update = factory();
        validateTabValue(activation, update);
        return update;
      });
    },
    // Placement, addressed like `updateTab` so a plugin reaches only its own tab, and delegating to
    // the same `setDock` the client's dock-cycle control uses — there is still one docking path.
    dockTab: (instanceKey, dock) => {
      if (!isEnabled()) return;
      const index = managers.tab.tabs.findIndex(
        (tab) => tab.plugin?.id === declaration.id && tab.plugin.instanceKey === instanceKey,
      );
      if (index !== -1) managers.tab.setDock(index, dock);
    },
    // Server-only transient state, addressed like `updateTab`. It never reaches `buildTabView`, so
    // writing it neither marks the view dirty nor sends anything to a client.
    snapshotTab: (instanceKey, text) => {
      if (!isEnabled()) return;
      const tab = managers.tab.tabs.find(
        (candidate) => candidate.plugin?.id === declaration.id
          && candidate.plugin.instanceKey === instanceKey,
      );
      if (tab) tab.pageSnapshot = { text, capturedAt: Date.now() };
    },
    openClaimedFiles: (target) => {
      if (!isEnabled()) return;
      openRequests.push(target);
    },
    topicData: (topic) => {
      requireDeclaredTopic(declaration, topic);
      return isEnabled() ? readTopicData(managers, topic) : [];
    },
    topicAction: (action) => {
      requireDeclaredTopic(declaration, action.topic);
      if (isEnabled()) runTopicAction(managers, action);
    },
    configuredViewer: () => isEnabled() ? getConfig().externalViewers?.[declaration.id] ?? '' : '',
    openExternally: (absPath, application) => isEnabled() && didOsOpen(absPath, application),
    rejectRequest: (reason) => {
      throw new TabPluginRejection(reason);
    },
    reportFailure: (reason) => {
      throw reason instanceof Error ? reason : new Error(String(reason));
    },
  }, declaration.capabilities);
}
