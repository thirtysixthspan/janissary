import type { Tab } from './types.js';

// The tab record declares `view` and its five view-specific payloads as independent optional fields,
// and documents in prose that each payload is "present only when `view === '<kind>'`". Nothing
// enforces that, so consumers used to recover it with a non-null assertion — which turns a payload
// that is genuinely absent (a harness tab caught mid-provision, a plugin record dropped by a failed
// activation) into a `TypeError` in a render or an event handler rather than a tab that degrades.
//
// These predicates check the invariant instead of assuming it: both the discriminant and the
// payload. Payload types are spelled `NonNullable<Tab[...]>` so they cannot drift from the record.

export type HarnessTab = Tab & { view: 'harness'; harness: NonNullable<Tab['harness']> };
export type EditorTab = Tab & { view: 'editor'; editor: NonNullable<Tab['editor']> };
export type FilesTab = Tab & { view: 'files'; files: NonNullable<Tab['files']> };
export type PluginTab = Tab & { view: 'plugin'; plugin: NonNullable<Tab['plugin']> };
export type MonitorTab = Tab & { view: 'monitor'; monitor: NonNullable<Tab['monitor']> };

export function isHarnessTab(tab: Tab): tab is HarnessTab {
  return tab.view === 'harness' && tab.harness !== undefined;
}

export function isEditorTab(tab: Tab): tab is EditorTab {
  return tab.view === 'editor' && tab.editor !== undefined;
}

export function isFilesTab(tab: Tab): tab is FilesTab {
  return tab.view === 'files' && tab.files !== undefined;
}

export function isPluginTab(tab: Tab): tab is PluginTab {
  return tab.view === 'plugin' && tab.plugin !== undefined;
}

export function isMonitorTab(tab: Tab): tab is MonitorTab {
  return tab.view === 'monitor' && tab.monitor !== undefined;
}
