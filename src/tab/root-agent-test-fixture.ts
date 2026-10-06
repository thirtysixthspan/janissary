import type { Tab } from './types.js';
import type { TabManager } from './manager.js';
import { makeTab } from './index.js';
import { distinctColor } from './colors.js';
import { tabRuntime } from './runtime.js';

// A `TabManager` starts with no tabs — the launch shell is opened later, through the shell plugin —
// so a test that stages its commands in an agent tab seeds one here: a `janus` agent tab at index 0,
// active, in the launch directory, the first palette colour, group 1.
export function seedRootAgentTab(manager: TabManager): Tab {
  const tab = makeTab('janus', distinctColor([]));
  tab.toolStepsExpanded = false;
  manager.tabs = [tab, ...manager.tabs];
  manager.activeTab = 0;
  tabRuntime(tab).cwd = manager.launchDir;
  return tab;
}
