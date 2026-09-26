import type { TabView } from '@shared/protocol';

// The client mirror of `src/tab/view-guards.ts`. The wire shape carries the same five optional
// payloads under the same "present only for this view kind" prose invariant, and the same reason to
// check it rather than assert it: a payload that is absent should render nothing for that layer, not
// throw inside a render and take the tab body out.

export type HarnessTabView = TabView & { view: 'harness'; harness: NonNullable<TabView['harness']> };
export type EditorTabView = TabView & { view: 'editor'; editor: NonNullable<TabView['editor']> };
export type FilesTabView = TabView & { view: 'files'; files: NonNullable<TabView['files']> };
export type PluginTabView = TabView & { view: 'plugin'; plugin: NonNullable<TabView['plugin']> };
export type MonitorTabView = TabView & { view: 'monitor'; monitor: NonNullable<TabView['monitor']> };

export function isHarnessTabView(tab: TabView): tab is HarnessTabView {
  return tab.view === 'harness' && tab.harness !== undefined;
}

export function isEditorTabView(tab: TabView): tab is EditorTabView {
  return tab.view === 'editor' && tab.editor !== undefined;
}

export function isFilesTabView(tab: TabView): tab is FilesTabView {
  return tab.view === 'files' && tab.files !== undefined;
}

export function isPluginTabView(tab: TabView): tab is PluginTabView {
  return tab.view === 'plugin' && tab.plugin !== undefined;
}

export function isMonitorTabView(tab: TabView): tab is MonitorTabView {
  return tab.view === 'monitor' && tab.monitor !== undefined;
}

// Pair each tab with its position in the tab strip, keeping only those the guard admits. The index
// comes from the *unfiltered* list on purpose: it is what identifies the tab to the pane layout and
// to the close and split handlers, so filtering before pairing would renumber and misroute them.
export function indexedTabs<T extends TabView>(
  tabs: TabView[], guard: (tab: TabView) => tab is T,
): { t: T; index: number }[] {
  return tabs
    .map((t, index) => ({ t, index }))
    .filter((pair): pair is { t: T; index: number } => guard(pair.t));
}
