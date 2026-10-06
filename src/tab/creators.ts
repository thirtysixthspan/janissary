import type { Tab, PluginTabRecord, EditorView, FileNavigatorView } from './types.js';
import {
  makePluginTab, makeEditorTab, makeFilesTab, makeNotificationsTab,
} from './index.js';
import { distinctColor } from './colors.js';
import { insertTabInGroup } from './utils.js';
import { NOTIFICATIONS_LABEL } from '../notifications/tab.js';
import type { LaunchNameRow } from '../launch-name/check.js';
import {
  uniquePluginLabel, uniqueEditorLabel, uniqueFilesLabel, unusedAgentName,
} from './unique-labels.js';

type TabAndActive = { tabs: Tab[]; activeTab: number };

function finalizeTab(tabs: Tab[], tab: Tab, label: string, title: string): TabAndActive {
  tab.title = title;
  const newTabs = insertTabInGroup(tabs, tab);
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

// `fixedLabel` names the tab outright, ahead of both the agent pool and the label prefix. Only the
// launch shell uses it: the tab the application opens at launch is always `janus`.
export function addPluginTab(
  tabs: Tab[], activeTab: number, labelPrefix: string, title: string, plugin: PluginTabRecord,
  agentNamed = false, rows: readonly LaunchNameRow[] = [], fixedLabel?: string,
): TabAndActive {
  const creator = tabs[activeTab];
  const name = fixedLabel ?? (agentNamed ? unusedAgentName(tabs, rows) : undefined);
  const label = name ?? uniquePluginLabel(tabs, labelPrefix);
  const shownTitle = name ?? title;
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makePluginTab(label, dotColor, tabs.length + 1, group, groupColor, shownTitle, plugin);
  return finalizeTab(tabs, tab, label, shownTitle);
}


export function addEditorTab(tabs: Tab[], activeTab: number, view: EditorView): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniqueEditorLabel(tabs);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeEditorTab(label, dotColor, tabs.length + 1, group, groupColor, view);
  return finalizeTab(tabs, tab, label, view.name);
}

export function addFilesTab(tabs: Tab[], activeTab: number, view: FileNavigatorView): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniqueFilesLabel(tabs);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeFilesTab(label, dotColor, tabs.length + 1, group, groupColor, view);
  const newTabs = insertTabInGroup(tabs, tab, 'start');
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

function addStartTab(
  tabs: Tab[], activeTab: number, label: string,
  makeTab: (dotColor: string, group: number, groupColor: string) => Tab,
): TabAndActive {
  const creator = tabs[activeTab];
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeTab(dotColor, group, groupColor);
  const newTabs = insertTabInGroup(tabs, tab, 'start');
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

export function addNotificationsTab(tabs: Tab[], activeTab: number): TabAndActive {
  return addStartTab(tabs, activeTab, NOTIFICATIONS_LABEL, (dotColor, group, groupColor) =>
    makeNotificationsTab(NOTIFICATIONS_LABEL, dotColor, tabs.length + 1, group, groupColor));
}
