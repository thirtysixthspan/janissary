import type { Tab } from './types.js';
import type { TabManager } from './manager.js';
import { makeTab } from './index.js';
import { distinctColor } from './colors.js';
import { tabRuntime } from './runtime.js';

// A `TabManager` starts with no tabs — the launch shell is opened later, through the shell plugin —
// so a test that stages its commands in an tab seeds one here: a `janus` tab at index 0,
// active, in the launch directory, the first palette colour, group 1.
export function seedRootTab(manager: TabManager): Tab {
  const tab = makeTab('janus', distinctColor([]));
  tab.toolStepsExpanded = false;
  manager.tabs = [tab, ...manager.tabs];
  manager.activeTab = 0;
  tabRuntime(tab).cwd = manager.launchDir;
  return tab;
}

export function seedTestTab(manager: TabManager, label: string): Tab {
  const creator = manager.cur();
  const tab = makeTab(label, distinctColor(manager.tabs.map((entry) => entry.dotColor)), manager.tabs.length + 1);
  tab.group = creator.group;
  tab.groupColor = creator.groupColor;
  tabRuntime(tab).cwd = manager.cwdOf(creator.label) ?? manager.launchDir;
  manager.insertTabInGroup(tab);
  manager.setActiveTab(manager.findIndex(label));
  return manager.byLabel(label) ?? tab;
}
