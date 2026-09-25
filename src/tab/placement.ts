import type { TabView } from '../protocol/tab.js';
import type { CenterPane } from './types.js';

// Where a tab sits and what closing it does, shared by the server and the web client through the
// `@shared` alias so the two cannot drift. Typed over the three fields both the server `Tab` and the
// wire `TabView` carry, and free of runtime imports so the client bundle can load it.

export type PlacedTab = Pick<TabView, 'dock' | 'view' | 'pane'>;

export function centerPane(tab: PlacedTab): CenterPane {
  return tab.pane ?? 'left';
}

// Reporting tabs are a separate class from action tabs: they report, they never take commands.
// Currently just the monitor window.
export function isReportingTab(tab: PlacedTab): boolean {
  return tab.view === 'monitor';
}

export function isCenterActionTab(tab: PlacedTab): boolean {
  return !tab.dock && !isReportingTab(tab);
}

export function isSplitEligibleTab(tab: PlacedTab): boolean {
  return isCenterActionTab(tab) && tab.view !== 'notifications';
}

// Closing the last non-docked tab quits the app. A docked tab never counts, and closing one never
// quits, however few center tabs remain.
export function closeQuitsApp(tabs: PlacedTab[], index: number): boolean {
  const tab = index < 0 ? undefined : tabs.at(index);
  if (!tab || tab.dock) return false;
  return tabs.filter((candidate) => !candidate.dock).length <= 1;
}
