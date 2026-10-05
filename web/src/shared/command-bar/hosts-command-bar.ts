import type { TabView } from '@shared/protocol';

// Whether this tab's body is a plugin whose declaration says it hosts the application command bar.
// The host puts that on the tab's view, so the shared pickers and queue popup follow the declaration
// rather than recognising one plugin by its id.
export function hostsCommandBar(tab: TabView | undefined): boolean {
  return tab?.view === 'plugin' && tab.plugin?.hostsCommandBar === true;
}
