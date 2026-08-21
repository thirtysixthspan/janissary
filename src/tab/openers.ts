import type { Tab, EditorView, FileNavigatorView } from './types.js';
import type { TabPluginPayload, TabPluginResources, TabPluginTabUpdate } from '../plugins/api.js';
import { messageBus } from '../bus.js';
import {
  addPluginTab, addEditorTab, addFilesTab, addNotificationsTab,
} from './creators.js';

// Minimal surface these openers need from the TabManager. Kept structural (rather than importing
// the TabManager type) so this module has no import cycle back to tab-manager.ts.
interface OpenTarget {
  tabs: Tab[];
  activeTab: number;
  setActiveTab(index: number): void;
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
  registerFile(path: string): string;
  openFiles: Map<string, string>;
}

function activate(target: OpenTarget, result: { tabs: Tab[]; activeTab: number }): void {
  target.applyOpenResult(result);
  messageBus.emit('state', { type: 'dirty' });
}

// Runs a plugin factory with a registration window open around it, and reports back every reference
// it registered. The window closes as soon as the factory returns, so a plugin that stashed the
// resources object cannot keep serving files from outside the call the host granted them for, and a
// factory that throws leaves nothing served. Shared by the open and update paths so a reference
// registered through one is scoped and released exactly as one registered through the other.
function withResources<Result>(
  target: OpenTarget,
  factory: (resources: TabPluginResources) => Result,
): { result: Result; fileRefs: string[] } {
  const fileRefs: string[] = [];
  let acceptingResources = true;
  try {
    const result = factory({
      registerFile: (path) => {
        if (!acceptingResources) throw new Error('plugin tab resources are no longer available');
        const reference = target.registerFile(path);
        fileRefs.push(reference.replace(/^\/open\//, ''));
        return reference;
      },
    });
    return { result, fileRefs };
  } catch (error) {
    for (const reference of fileRefs) target.openFiles.delete(reference);
    throw error;
  } finally {
    acceptingResources = false;
  }
}

export function openPluginTab(
  target: OpenTarget,
  pluginId: string,
  labelPrefix: string,
  instanceKey: string,
  schemaVersion: number,
  sourceLabel: string,
  factory: (resources: TabPluginResources) => TabPluginPayload,
): void {
  const existing = target.tabs.find(
    (tab) => tab.plugin?.id === pluginId && tab.plugin.instanceKey === instanceKey,
  );
  if (existing) {
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  // Every other opener runs synchronously inside its dispatch, so the active tab cannot move under
  // it. A plugin's can: the first call awaits activation, and any handler may await before opening.
  // The creating tab is the one whose transcript ran the command, so grouping resolves by
  // `sourceLabel` rather than by whatever happens to be focused when the factory finally runs.
  const sourceIndex = target.tabs.findIndex((tab) => tab.label === sourceLabel);
  const creatorIndex = sourceIndex === -1 ? target.activeTab : sourceIndex;
  const { result: created, fileRefs } = withResources(target, factory);
  activate(target, addPluginTab(target.tabs, creatorIndex, labelPrefix, created.title, {
    id: pluginId,
    instanceKey,
    schemaVersion,
    payload: created.payload,
    fileRefs,
    sourceLabel,
  }));
}


// Replaces what an already-open plugin tab shows. The tab is addressed by its owning plugin plus the
// instance key it was opened with, so a plugin can only ever write its own tab, and a key with no
// open tab leaves everything untouched. Placement never moves: the payload is replaced, the title
// only when the factory returned one, and the instance key only when the factory returned a free
// one — a key another tab of the same plugin already holds would make two tabs indistinguishable to
// every capability that addresses one, so it is refused while the rest of the update still applies.
// An update may also begin serving a file the tab did not hold before; those references join the
// tab's own `fileRefs`, so closing it releases them along with everything it opened with.
export function updatePluginTab(
  target: OpenTarget,
  pluginId: string,
  instanceKey: string,
  factory: (resources: TabPluginResources) => TabPluginTabUpdate,
): void {
  const tab = target.tabs.find(
    (candidate) => candidate.plugin?.id === pluginId && candidate.plugin.instanceKey === instanceKey,
  );
  if (!tab?.plugin) return;
  const { result: update, fileRefs } = withResources(target, factory);
  const rekeyed = update.instanceKey !== undefined && update.instanceKey !== instanceKey
    && target.tabs.every((candidate) => candidate.plugin?.id !== pluginId
      || candidate.plugin.instanceKey !== update.instanceKey);
  tab.plugin = {
    ...tab.plugin,
    payload: update.payload,
    fileRefs: [...tab.plugin.fileRefs, ...fileRefs],
    ...(rekeyed && { instanceKey: update.instanceKey! }),
  };
  if (update.title !== undefined) tab.title = update.title;
  messageBus.emit('state', { type: 'dirty' });
}

export function openEditorTab(
  target: OpenTarget, view: EditorView, watch: (label: string, path: string) => void,
): void {
  const existing = view.newFile ? undefined : target.tabs.find((t) => t.editor?.path === view.path);
  if (existing) {
    if (view.line !== undefined) existing.editor!.line = view.line;
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  const result = addEditorTab(target.tabs, target.activeTab, view);
  target.applyOpenResult(result);
  watch(result.tabs[result.activeTab].label, view.path);
  messageBus.emit('state', { type: 'dirty' });
}

export function openFilesTab(target: OpenTarget, view: FileNavigatorView): void {
  activate(target, addFilesTab(target.tabs, target.activeTab, view));
}

export function openNotificationsTab(target: OpenTarget): void {
  activate(target, addNotificationsTab(target.tabs, target.activeTab));
}
