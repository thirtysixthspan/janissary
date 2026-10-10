import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import {
  TAB_PLUGIN_CAPABILITY_NAMES,
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginCapabilityName,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { HandlerDeadline } from './guard.js';
import { declaredResources } from './declared-resources.js';
import { lineCapabilities } from './line-capabilities.js';
import { acpCapabilities } from './acp-capabilities.js';
import { fileCapabilities } from './file-capabilities.js';
import { launchCapabilities, type DeferredPluginCall } from './launch-tab.js';
import { armHarnessIdleEscalation, cancelHarnessIdleEscalation } from '../harness/idle-notification.js';
import { isJsonCompatible } from './json-compatible.js';

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

export function createPluginContext(
  managers: Managers,
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  origin: PluginFailureOrigin,
  isEnabled: () => boolean,
  // Collects `openClaimedFiles` targets for the host to run once the guarded call has returned.
  openRequests: string[] = [],
  // The tab whose client asked, when the call came from one — an intent, or a selection action on a
  // plugin tab. Distinct from `origin`, which is the tab a *command* was invoked from and which stays
  // that way for every capability.
  answeringLabel?: string,
  // The guarded call's clock, so a capability that runs host work the plugin waits on can stop it.
  deadline?: HandlerDeadline,
  // A later guarded call into this plugin, for a handler that outlives this one — `launchTab`'s ready.
  deferred?: DeferredPluginCall,
  adoptPtyId?: string,
): TabPluginServerCapabilities {
  return restrictToDeclared({
    note: (text) => {
      if (!isEnabled()) return;
      if (managers.tab.tabs.some((tab) => tab.label === origin.label)) {
        managers.tab.append(origin.label, { input: origin.command, output: text });
      }
    },
    // The plugin's own line into the notifications feed, kept distinct from the host's failure path
    // by its own event type: a plugin says something happened, it never says a plugin broke. The one
    // thing the plugin may add is a file for the line to carry, which the host serves from the
    // plugin's own workspace like any other plugin-registered file. A line may name one of the
    // plugin's own tabs to be attributed to, resolved here so it can never name anybody else's.
    notifyUser: (text, options) => {
      if (!isEnabled()) return;
      const own = options?.tab === undefined
        ? undefined
        : managers.tab.pluginTabByInstanceKey(declaration.id, options.tab);
      notify(managers, 'plugin-note', own?.label ?? origin.label, text, {
        ...(options?.openFile && { openFile: options.openFile }),
      });
    },
    // A launch origin is the one origin with no tab behind it, and the tab it opens takes its label.
    // The source is the tab `originTab` reports: the answering tab when one asked, the origin otherwise.
    openOrFocusTab: (instanceKey, factory) => {
      if (!isEnabled()) return;
      const answering = answeringLabel !== undefined && managers.tab.byLabel(answeringLabel) ? answeringLabel : undefined;
      if (!answering && !origin.launch && managers.tab.tabs.every((tab) => tab.label !== origin.label)) return;
      managers.tab.openPluginTab(
        declaration.id,
        declaration.tabLabelPrefix,
        instanceKey,
        declaration.payloadSchemaVersion,
        answering ?? origin.label,
        (resources) => {
          const created = factory(declaredResources(declaration, resources));
          validateTabValue(activation, created);
          return created;
        },
        origin.launch ? { label: origin.label } : declaration.agentNamedTabs === true,
      );
    },
    ...launchCapabilities({
      managers, declaration, origin, answeringLabel, isEnabled, deferred,
      validate: (value) => { validateTabValue(activation, value); },
      adoptPtyId,
    }),
    // Unlike `openOrFocusTab`, this does not require the originating tab to still exist: the target
    // is the plugin's own tab, not the transcript that asked for the change.
    updateTab: (instanceKey, factory) => {
      if (!isEnabled()) return;
      managers.tab.updatePluginTab(declaration.id, instanceKey, (resources) => {
        const update = factory(declaredResources(declaration, resources));
        validateTabValue(activation, update);
        return update;
      });
    },
    setUnread: (instanceKey, unread) => {
      if (!isEnabled()) return;
      const tab = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
      if (!tab) return;
      if (unread) {
        if (managers.tab.markUnread(tab.label)) armHarnessIdleEscalation(managers, tab.label);
      } else {
        managers.tab.clearUnread(tab.label);
        cancelHarnessIdleEscalation(managers, tab.label);
      }
    },
    // The dot only, on the plugin's own record: a broadcast goes out when it changes, and nothing the
    // host routes by — the tab's runtime busy flag — moves with it.
    setBusy: (instanceKey, busy) => {
      if (!isEnabled()) return;
      const tab = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
      if (!tab || (tab.plugin.busy ?? false) === busy) return;
      tab.plugin.busy = busy;
      messageBus.emit('state', { type: 'dirty' });
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
      const tab = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
      if (tab) tab.pageSnapshot = { text, capturedAt: Date.now() };
    },
    // The four a plugin tab needs to be a place a line can be typed and a process can be checked on,
    // moved out whole because they depend on nothing here beyond what they are handed.
    ...lineCapabilities({ managers, declaration, origin, answeringLabel, isEnabled, deadline }),
    ...acpCapabilities({ managers, declaration, origin, answeringLabel, isEnabled, deadline }),
    ...fileCapabilities({ managers, declaration, origin, isEnabled, openRequests }),
    rejectRequest: (reason) => {
      throw new TabPluginRejection(reason);
    },
    reportFailure: (reason) => {
      throw reason instanceof Error ? reason : new Error(String(reason));
    },
  }, declaration.capabilities);
}
