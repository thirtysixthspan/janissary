import { stopPolling } from './poll.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import type { FilesTabState } from './state.js';

// The tree-view state `profile save` reads back off a navigator, the detail-mode switch its header
// button drives, and one tab's teardown. Split out of `manager.ts` to keep that file under the size
// limit — see `ai/guidelines/code-guidelines.md`.

// Stop one tab's watchers, debounce timer, and creation poll, then forget its state (tab close).
export function closeTabState(tabs: Map<string, FilesTabState>, label: string): void {
  const state = tabs.get(label);
  if (!state) return;
  if (state.debounce) clearTimeout(state.debounce);
  if (state.pullFlash) clearTimeout(state.pullFlash);
  stopPolling(state);
  for (const watcher of state.watchers.values()) watcher.stop();
  state.filesystem.dispose();
  tabs.delete(label);
}

// One tab's expanded directories as a plain sorted array. Sorted only so the written profile is
// deterministic (profiles are committable); restore order does not matter, since `buildRows` walks
// from the root and consults the expanded set rather than replaying insertion order.
export function expandedPathsOf(tabs: Map<string, FilesTabState>, label: string): string[] {
  const state = tabs.get(label);
  if (!state) return [];
  return [...state.expanded].toSorted((a, b) => a.localeCompare(b));
}

// One tab's current detail mode. An unknown tab reads as the default.
export function detailOfTab(tabs: Map<string, FilesTabState>, label: string): FileNavigatorDetail {
  return tabs.get(label)?.details ?? 'name';
}

// Switch which detail a tree shows beside each row name. The stat cache survives the switch — the
// values it holds are mode-independent, so only the rendering changes.
export function setTabDetail(
  tabs: Map<string, FilesTabState>, label: string, details: FileNavigatorDetail,
  rebuild: (label: string) => void,
): void {
  const state = tabs.get(label);
  if (!state) return;
  state.details = details;
  rebuild(label);
}
