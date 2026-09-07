import type { Tab } from './types.js';
import {
  isEditorTab, isFilesTab, isHarnessTab, isMonitorTab, isPluginTab,
  type EditorTab, type FilesTab, type HarnessTab, type MonitorTab, type PluginTab,
} from './view-guards.js';

// By-label lookups for `TabManager`, which offered only `findIndex` (an index) and `cur()`. Callers
// scanned its public `tabs` array themselves — fifty-two times across thirty-one modules — and then
// read the returned record's view payload directly, re-deriving both the scan and the "does this tab
// really carry that payload" question at every site.
//
// Shaped like `runtime-operations.ts` and `transcript-operations.ts`: plain functions over a `Tab[]`,
// which the manager delegates to.

// The first tab with this label, exactly as `find` did — this is an accessor, not a new rule. One
// method is what lets a map or a guard go behind it later without touching every call site.
export function byLabel(tabs: Tab[], label: string): Tab | undefined {
  return tabs.find((tab) => tab.label === label);
}

// The guard-typed accessors below hand back a narrowed tab or nothing, so a caller gets a
// non-optional payload instead of a `Tab` plus its own optional-chained check. They are stricter
// than the `tab?.harness` tests they replace: the predicates check the `view` discriminant *and*
// the payload, so a tab whose view names a kind but whose payload is missing — a harness caught
// mid-provision, a plugin record dropped by a failed activation — is no longer treated as one.

export function harnessTab(tabs: Tab[], label: string): HarnessTab | undefined {
  const tab = byLabel(tabs, label);
  return tab && isHarnessTab(tab) ? tab : undefined;
}

export function editorTab(tabs: Tab[], label: string): EditorTab | undefined {
  const tab = byLabel(tabs, label);
  return tab && isEditorTab(tab) ? tab : undefined;
}

export function filesTab(tabs: Tab[], label: string): FilesTab | undefined {
  const tab = byLabel(tabs, label);
  return tab && isFilesTab(tab) ? tab : undefined;
}

export function pluginTab(tabs: Tab[], label: string): PluginTab | undefined {
  const tab = byLabel(tabs, label);
  return tab && isPluginTab(tab) ? tab : undefined;
}

export function monitorTab(tabs: Tab[], label: string): MonitorTab | undefined {
  const tab = byLabel(tabs, label);
  return tab && isMonitorTab(tab) ? tab : undefined;
}
