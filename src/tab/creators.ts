import type { Tab, PluginTabRecord, EditorView, FileNavigatorView } from './types.js';
import {
  makePluginTab, makeEditorTab, makeFilesTab, makeNotificationsTab, distinctColor, insertTabInGroup,
} from './index.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
import {
  uniquePluginLabel, uniqueEditorLabel, uniqueFilesLabel,
} from './unique-labels.js';

export {
  uniquePluginLabel, uniqueEditorLabel, uniqueFilesLabel,
} from './unique-labels.js';

type TabAndActive = { tabs: Tab[]; activeTab: number };

function finalizeTab(tabs: Tab[], tab: Tab, label: string, title: string): TabAndActive {
  tab.title = title;
  const newTabs = insertTabInGroup(tabs, tab);
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

export function addPluginTab(
  tabs: Tab[], activeTab: number, labelPrefix: string, title: string, plugin: PluginTabRecord,
): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniquePluginLabel(tabs, labelPrefix);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makePluginTab(label, dotColor, tabs.length + 1, group, groupColor, title, plugin);
  return finalizeTab(tabs, tab, label, title);
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
