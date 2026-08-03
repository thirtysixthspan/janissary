import type { Tab, ImageView, MarkdownView, EditorView, PageView, FileNavigatorView } from './types.js';
import type { TabPluginPayload, TabPluginResources } from '../plugins/api.js';
import { messageBus } from '../bus.js';
import {
  addImageTab, addPluginTab, addMarkdownTab, addEditorTab, addPageTab, addFilesTab, addNotificationsTab, addSchedulesTab,
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

export function openImageTab(target: OpenTarget, image: ImageView): void {
  const existing = target.tabs.find((t) => t.image?.path === image.path);
  if (existing) {
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  activate(target, addImageTab(target.tabs, target.activeTab, image));
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
  const fileRefs: string[] = [];
  let acceptingResources = true;
  let created: TabPluginPayload;
  try {
    created = factory({
      registerFile: (path) => {
        if (!acceptingResources) throw new Error('plugin tab resources are no longer available');
        const reference = target.registerFile(path);
        fileRefs.push(reference.replace(/^\/open\//, ''));
        return reference;
      },
    });
  } catch (error) {
    for (const reference of fileRefs) target.openFiles.delete(reference);
    throw error;
  } finally {
    acceptingResources = false;
  }
  activate(target, addPluginTab(target.tabs, creatorIndex, labelPrefix, created.title, {
    id: pluginId,
    instanceKey,
    schemaVersion,
    payload: created.payload,
    fileRefs,
    sourceLabel,
  }));
}

export function openMarkdownTab(target: OpenTarget, view: MarkdownView): void {
  activate(target, addMarkdownTab(target.tabs, target.activeTab, view));
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

export function openPageTab(target: OpenTarget, { url, domain }: Pick<PageView, 'url' | 'domain'>): void {
  activate(target, addPageTab(target.tabs, target.activeTab, url, domain));
}

export function openFilesTab(target: OpenTarget, view: FileNavigatorView): void {
  activate(target, addFilesTab(target.tabs, target.activeTab, view));
}

export function openNotificationsTab(target: OpenTarget): void {
  activate(target, addNotificationsTab(target.tabs, target.activeTab));
}

export function openSchedulesTab(target: OpenTarget): void {
  activate(target, addSchedulesTab(target.tabs, target.activeTab));
}
