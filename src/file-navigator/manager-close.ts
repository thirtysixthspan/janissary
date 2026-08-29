import type { Managers } from '../managers.js';
import { closeTabState } from './manager-profile.js';
import type { FilesTabState } from './state.js';

function closeNavigator(
  managers: Managers, tabs: Map<string, FilesTabState>, label: string,
): void {
  const remote = tabs.get(label)?.remote;
  closeTabState(tabs, label);
  if (remote) managers.remote.release(label);
}

// A remote navigator is tied to the source tab that opened it. Close and release its state inline,
// then remove the visible tab on the next turn so source-tab cleanup is not re-entered.
export function closeFileNavigatorTabs(
  managers: Managers, tabs: Map<string, FilesTabState>, label: string,
): void {
  closeNavigator(managers, tabs, label);
  for (const [navigatorLabel, state] of tabs) {
    if (state.ownerLabel !== label) continue;
    closeNavigator(managers, tabs, navigatorLabel);
    setTimeout(() => {
      const index = managers.tab.findIndex(navigatorLabel);
      if (index !== -1) managers.tab.closeTab(index);
    }, 0);
  }
}
