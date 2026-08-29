import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';
import type { Tab } from '../tab/types.js';

export function withFilesState<T>(
  tabs: Map<string, FilesTabState>, label: string, missing: T, use: (state: FilesTabState) => T,
): T {
  const state = tabs.get(label);
  return state ? use(state) : missing;
}

export function findOpenFilesTab(
  managers: Managers, tabs: Map<string, FilesTabState>, label: string,
): { state: FilesTabState; tab: Tab } | undefined {
  return withFilesState(tabs, label, undefined, (state) => {
    const tab = managers.tab.tabs.find((candidate) => candidate.label === label);
    return tab?.files ? { state, tab } : undefined;
  });
}
