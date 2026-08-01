import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';

export function findOpenFilesTab(
  managers: Managers,
  states: Map<string, FilesTabState>,
  label: string,
) {
  const state = states.get(label);
  if (!state) return;
  const tab = managers.tab.tabs.find((candidate) => candidate.label === label);
  if (!tab?.files) return;
  return { state, tab };
}
