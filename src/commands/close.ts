import type { Command } from './types.js';
import { cleanupResources } from '../cleanup-handlers.js';

export const command: Command = {
  name: 'close',
  match: (command_) => command_.toLowerCase() === 'close',
  handler: (_command, context) => {
    const {
      tabs, activeTab, setTabs, setActiveTab, setAcpInfo, setShellActive,
      setAgentStates, setTabDbConns, exit,
      shellsRef, acpRef, browserRef, workspaceRef,
      closeTabBrowser,
    } = context;
    const tabIndex = activeTab;
    if (tabs.length <= 1) {
      cleanupResources({ workspaceRef, shellsRef, acpRef, browserRef });
      exit();
    } else {
      const closedTab = tabs[tabIndex];
      if (closedTab.workspaceDir) {
        removeWorkspace(closedTab.workspaceDir);
        workspaceRef.current.delete(closedTab.workspaceDir);
      }
      shellsRef.current.get(tabIndex)?.kill();
      shellsRef.current.delete(tabIndex);
      acpRef.current.get(tabIndex)?.kill();
      acpRef.current.delete(tabIndex);
      closeTabBrowser(tabIndex);
      setAcpInfo((previous) => { const copy = { ...previous }; delete copy[tabIndex]; return copy; });
      setShellActive((previous) => { const copy = { ...previous }; delete copy[tabIndex]; return copy; });
      const closedLabel = closedTab.label;
      setTabs((previous) => previous.filter((_, index) => index !== tabIndex));
      setAgentStates((previous) => { const copy = { ...previous }; delete copy[closedLabel]; return copy; });
      setTabDbConns((previous) => { const copy = { ...previous }; delete copy[closedLabel]; return copy; });
      setActiveTab((previous) => Math.min(previous, tabs.length - 2));
    }
  },
};
