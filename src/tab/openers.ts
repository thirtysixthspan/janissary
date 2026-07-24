import type { Tab, ImageView, MarkdownView, EditorView, PageView, FileNavigatorView } from '../types.js';
import { messageBus } from '../bus.js';
import {
  addImageTab, addMarkdownTab, addEditorTab, addPageTab, addFilesTab, addNotificationsTab, addSchedulesTab,
} from './creators.js';

// Minimal surface these openers need from the TabManager. Kept structural (rather than importing
// the TabManager type) so this module has no import cycle back to tab-manager.ts.
interface OpenTarget {
  tabs: Tab[];
  activeTab: number;
  setActiveTab(index: number): void;
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
}

function activate(target: OpenTarget, result: { tabs: Tab[]; activeTab: number }): void {
  target.applyOpenResult(result);
  messageBus.emit('state', { type: 'dirty' });
}

export function openImageTab(target: OpenTarget, image: ImageView): void {
  activate(target, addImageTab(target.tabs, target.activeTab, image));
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
