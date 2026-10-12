import type { Tab, EditorView } from './types.js';
import { addEditorTab } from './creators.js';
import { releaseFileReference } from './file-registry.js';
import { messageBus } from '../bus.js';

type EditorTabTarget = {
  tabs: Tab[];
  activeTab: number;
  setActiveTab(index: number): void;
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void;
  openFiles: Map<string, string>;
};

export function openEditorTab(
  target: EditorTabTarget, view: EditorView, watch: (label: string, path: string) => void,
  onCreated?: (label: string) => void,
): string {
  const existing = view.newFile ? undefined : target.tabs.find(
    (tab): tab is Tab & { editor: EditorView } => tab.editor?.path === view.path,
  );
  if (existing) {
    releaseFileReference(target.openFiles, view.url);
    if (view.line !== undefined) {
      existing.editor.line = view.line;
      existing.editor.lineRequest = (existing.editor.lineRequest ?? 0) + 1;
    }
    target.setActiveTab(target.tabs.indexOf(existing));
    messageBus.emit('state', { type: 'dirty' });
    return existing.label;
  }
  const result = addEditorTab(target.tabs, target.activeTab, view);
  target.applyOpenResult(result);
  const label = result.tabs[result.activeTab].label;
  onCreated?.(label);
  watch(label, view.path);
  messageBus.emit('state', { type: 'dirty' });
  return label;
}
