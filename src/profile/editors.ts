import { insertTabInGroup } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { ProfileEditorsEntry } from '../types.js';
import type { MainAreaCandidate } from './focus.js';

// A newly created editor tab inherits its group from whichever tab is currently active in the
// TabManager (see `addEditorTab`), which does not necessarily match this entry's own authored
// `group` (or the launch's default group, when the entry authors none). When it doesn't,
// relocate the tab into its intended group, preserving that group's contiguity in the tab strip.
// Shared with `view-tabs.ts`, whose four tab kinds are opened the same way.
export function relocateToGroup(managers: Managers, targetGroup: number, groupColor: string): void {
  const index = managers.tab.activeTab;
  const tab = managers.tab.tabs[index];
  if (!tab || tab.group === targetGroup) return;
  const without = [...managers.tab.tabs.slice(0, index), ...managers.tab.tabs.slice(index + 1)];
  const moved = { ...tab, group: targetGroup, groupColor };
  managers.tab.tabs = insertTabInGroup(without, moved);
  managers.tab.setActiveTab(managers.tab.findIndex(moved.label));
}

export function openProfileEditors(
  editors: ProfileEditorsEntry[], managers: Managers, defaultLabel: string | undefined, notes: string[],
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
): MainAreaCandidate[] {
  const opened: MainAreaCandidate[] = [];
  for (const entry of editors) {
    const label = entry.in ?? defaultLabel;
    if (label === undefined) { notes.push('Editor tab: no tab to root it at.'); continue; }
    const before = managers.tab.tabs.length;
    managers.openFile.edit(`edit ${entry.path}`, entry.path, label, entry.line);
    if (managers.tab.tabs.length > before) {
      const targetGroup = entry.group ?? defaultGroup;
      const dotColor = managers.tab.tabs[managers.tab.activeTab]?.dotColor ?? '';
      relocateToGroup(managers, targetGroup, colorForGroup(targetGroup, dotColor));
    }
    const editorLabel = managers.tab.tabs[managers.tab.activeTab]?.label;
    if (editorLabel) {
      opened.push({ label: editorLabel, number: entry.number, focus: entry.focus, pane: entry.pane });
    }
    notes.push('Opened editor tab.');
  }
  return opened;
}
