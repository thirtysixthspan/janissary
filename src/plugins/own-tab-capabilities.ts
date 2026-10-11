import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { armHarnessIdleEscalation, cancelHarnessIdleEscalation } from '../harness/idle-notification.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';

// The capabilities that act on one of this plugin's own tabs, each addressed by instance key the way
// `updateTab` is: the badge, the busy dot, where the tab sits, and the server-only snapshot a monitor
// watching it feeds on. Grouped because they are one shape — resolve the tab, do one thing to it —
// and because they depend on nothing beyond what they are handed.

export function ownTabCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  isEnabled: () => boolean;
}): Pick<TabPluginServerCapabilities, 'setUnread' | 'setBusy' | 'dockTab' | 'snapshotTab'> {
  const { managers, declaration, isEnabled } = input;
  return {
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
    // Placement, addressed like `setBusy` so a plugin reaches only its own tab, and delegating to the
    // same `setDock` the client's dock-cycle control uses — there is still one docking path.
    dockTab: (instanceKey, dock) => {
      if (!isEnabled()) return;
      const index = managers.tab.tabs.findIndex(
        (tab) => tab.plugin?.id === declaration.id && tab.plugin.instanceKey === instanceKey,
      );
      if (index !== -1) managers.tab.setDock(index, dock);
    },
    // Server-only transient state, addressed like `setBusy`. It never reaches `buildTabView`, so
    // writing it neither marks the view dirty nor sends anything to a client.
    snapshotTab: (instanceKey, text) => {
      if (!isEnabled()) return;
      const tab = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
      if (tab) tab.pageSnapshot = { text, capturedAt: Date.now() };
    },
  };
}
