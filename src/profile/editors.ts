import type { Managers } from '../managers.js';
import type { ProfileEditorsEntry } from '../types.js';
import type { MainAreaCandidate } from './focus.js';

export function openProfileEditors(
  editors: ProfileEditorsEntry[], managers: Managers, defaultLabel: string | undefined, notes: string[],
): MainAreaCandidate[] {
  const opened: MainAreaCandidate[] = [];
  for (const entry of editors) {
    const label = entry.in ?? defaultLabel;
    if (label === undefined) { notes.push('Editor tab: no tab to root it at.'); continue; }
    managers.openFile.edit(`edit ${entry.path}`, entry.path, label, entry.line);
    const editorLabel = managers.tab.tabs[managers.tab.activeTab]?.label;
    if (editorLabel) opened.push({ label: editorLabel, number: entry.tab?.number, focus: entry.tab?.focus });
    notes.push('Opened editor tab.');
  }
  return opened;
}
