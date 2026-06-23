import type { Command } from './types.js';
import { closeAllConnections } from '../connections.js';
import { removeWorkspace } from '../workspace.js';

export const command: Command = {
  name: 'close',
  match: (cmd) => cmd.toLowerCase() === 'close',
  handler: (_cmd, ctx) => {
    const {
      tabs, activeTab, setTabs, setActiveTab, setAcpInfo, setShellActive,
      setAgentStates, setTabDbConns, exit,
      shellsRef, acpRef, browserRef, workspaceRef,
      closeTabBrowser,
    } = ctx;
    const tabIndex = activeTab;
    if (tabs.length <= 1) {
      for (const dir of workspaceRef.current) removeWorkspace(dir);
      workspaceRef.current.clear();
      for (const [, shell] of shellsRef.current) shell.kill();
      shellsRef.current.clear();
      for (const [, session] of acpRef.current) session.kill();
      acpRef.current.clear();
      for (const [, e] of browserRef.current) void e.browser.close();
      browserRef.current.clear();
      closeAllConnections();
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
      setAcpInfo((prev) => { const copy = { ...prev }; delete copy[tabIndex]; return copy; });
      setShellActive((prev) => { const copy = { ...prev }; delete copy[tabIndex]; return copy; });
      const closedLabel = closedTab.label;
      setTabs((prev) => prev.filter((_, i) => i !== tabIndex));
      setAgentStates((prev) => { const copy = { ...prev }; delete copy[closedLabel]; return copy; });
      setTabDbConns((prev) => { const copy = { ...prev }; delete copy[closedLabel]; return copy; });
      setActiveTab((prev) => Math.min(prev, tabs.length - 2));
    }
  },
};
