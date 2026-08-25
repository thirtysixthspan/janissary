import type { TabView } from '@shared/protocol';

export type TabEntry = { tab: TabView; index: number };

// Reporting tabs are a separate class from action tabs: they report, they never take
// commands. A tab is a reporting tab when its view kind is in this set (currently just
// the monitor window).
export function isReportingTab(tab: TabView): boolean {
  return tab.view === 'monitor';
}
