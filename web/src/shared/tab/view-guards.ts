import type { TabView } from '@shared/protocol';

// The client mirror of `src/tab/view-guards.ts`. `TabView` is now a discriminated union whose members
// require the matching payload, so the narrowed types below come from the union via `Extract` rather
// than being hand-mirrored with `NonNullable`. The guards still check the invariant at runtime: a
// payload that is absent renders nothing for that layer rather than throwing inside a render.

export type HarnessTabView = Extract<TabView, { view: 'harness' }>;
export type EditorTabView = Extract<TabView, { view: 'editor' }>;
export type FilesTabView = Extract<TabView, { view: 'files' }>;
export type PluginTabView = Extract<TabView, { view: 'plugin' }>;
export type MonitorTabView = Extract<TabView, { view: 'monitor' }>;

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
