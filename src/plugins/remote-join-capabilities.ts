import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { TabPluginDeclaration, TabPluginServerCapabilities } from './api.js';
import { releasePluginRemoteResource } from './remote-capabilities.js';

export function remoteJoinCapabilities(input: {
  managers: Managers;
  declaration: TabPluginDeclaration;
  isEnabled: () => boolean;
}): Pick<TabPluginServerCapabilities, 'joinRemoteWorkspace' | 'releaseRemoteWorkspace'> {
  const { managers, declaration, isEnabled } = input;
  const ownTab = (instanceKey: string) =>
    isEnabled() ? managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey) : undefined;
  return {
    joinRemoteWorkspace: (instanceKey, sourceLabel) => {
      const tab = ownTab(instanceKey);
      if (!tab) return false;
      const source = managers.tab.byLabel(sourceLabel);
      if (!source?.remote || !managers.remote.get(sourceLabel)) return false;
      if (managers.remote.reconnectingOf(sourceLabel)) return false;
      if (!managers.remote.attach(tab.label, sourceLabel)) return false;
      tab.remote = { address: source.remote.address, host: source.remote.host };
      messageBus.emit('state', { type: 'dirty' });
      return true;
    },
    releaseRemoteWorkspace: (instanceKey) => {
      const tab = ownTab(instanceKey);
      if (!tab || (!managers.remote.entryOf(tab.label) && !tab.remote)) return;
      managers.remote.release(tab.label);
      delete tab.remote;
      releasePluginRemoteResource(tab.label);
      messageBus.emit('state', { type: 'dirty' });
    },
  };
}
