import type { Tab, ImageView, MarkdownView, EditorView, PageView, FileTreeView } from '../types.js';
import {
  makeImageTab, makeMarkdownTab, makeEditorTab, makePageTab, makeFilesTab, makeNotificationsTab, distinctColor, insertTabInGroup,
} from './index.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
import { getConfig } from '../config.js';
import {
  uniqueImageLabel, uniqueMarkdownLabel, uniqueEditorLabel, uniqueFilesLabel, uniquePageNumber,
} from './unique-labels.js';

export {
  uniqueImageLabel, uniqueMarkdownLabel, uniqueEditorLabel, uniqueFilesLabel, uniquePageNumber,
} from './unique-labels.js';

type TabAndActive = { tabs: Tab[]; activeTab: number };

export function addImageTab(tabs: Tab[], activeTab: number, image: ImageView): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniqueImageLabel(tabs);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeImageTab(label, dotColor, tabs.length + 1, group, groupColor, image);
  tab.title = image.name.slice(0, getConfig().tabNameMaxLength);
  const newTabs = insertTabInGroup(tabs, tab);
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

function finalizeTab(tabs: Tab[], tab: Tab, label: string, title: string): TabAndActive {
  tab.title = title.slice(0, getConfig().tabNameMaxLength);
  const newTabs = insertTabInGroup(tabs, tab);
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

export function addMarkdownTab(tabs: Tab[], activeTab: number, view: MarkdownView): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniqueMarkdownLabel(tabs);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeMarkdownTab(label, dotColor, tabs.length + 1, group, groupColor, view);
  return finalizeTab(tabs, tab, label, view.name);
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

export function addFilesTab(tabs: Tab[], activeTab: number, view: FileTreeView): TabAndActive {
  const creator = tabs[activeTab];
  const label = uniqueFilesLabel(tabs);
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeFilesTab(label, dotColor, tabs.length + 1, group, groupColor, view);
  const newTabs = insertTabInGroup(tabs, tab, 'start');
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}

export function addNotificationsTab(tabs: Tab[], activeTab: number): TabAndActive {
  const creator = tabs[activeTab];
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const tab = makeNotificationsTab(NOTIFICATIONS_LABEL, dotColor, tabs.length + 1, group, groupColor);
  const newTabs = insertTabInGroup(tabs, tab, 'start');
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === NOTIFICATIONS_LABEL) };
}

export function addPageTab(
  tabs: Tab[], activeTab: number, url: string, domain: string,
): TabAndActive {
  const creator = tabs[activeTab];
  const number = uniquePageNumber(tabs);
  const label = `page-${number}`;
  const dotColor = distinctColor(tabs.map((t) => t.dotColor));
  const group = creator?.group ?? 1;
  const groupColor = creator?.groupColor ?? dotColor;
  const page: PageView = { url, domain, number };
  const tab = makePageTab(label, dotColor, tabs.length + 1, group, groupColor, page);
  const newTabs = insertTabInGroup(tabs, tab);
  return { tabs: newTabs, activeTab: newTabs.findIndex((t) => t.label === label) };
}
