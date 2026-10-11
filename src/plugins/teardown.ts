import type { Managers } from '../managers.js';
import { openNotificationsTab } from '../notifications/tab.js';

// A disabled plugin owns no tabs. Closes every open tab belonging to one plugin and returns their
// labels so the host can keep answering for them: a client whose tab has just been closed still has
// requests in flight, and those deserve the recorded reason rather than "tab not found".
// Highest index first, so closing one tab never shifts the index of another still to be closed.
export function closePluginTabs(managers: Managers, pluginId: string): string[] {
  const center = managers.tab.tabs.filter((tab) => !tab.dock);
  const needsRecoveryTab = center.length > 0 && center.every((tab) => tab.plugin?.id === pluginId);
  const recoveryTab = needsRecoveryTab ? openNotificationsTab(managers) : undefined;
  const owned = managers.tab.tabs
    .map((tab, index) => ({ label: tab.label, index, id: tab.plugin?.id }))
    .filter((entry) => entry.id === pluginId);
  const highestIndexFirst = [...owned].toSorted((a, b) => b.index - a.index);
  for (const { index } of highestIndexFirst) managers.tab.closeTab(index);
  if (recoveryTab) managers.tab.setActiveTab(managers.tab.findIndex(recoveryTab.label));
  return owned.map((entry) => entry.label);
}
