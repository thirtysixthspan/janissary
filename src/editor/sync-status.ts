import type { TabRuntime } from '../tab/types.js';
import { tabRuntime } from '../tab/runtime.js';
import { isEditorTab, type EditorTab } from '../tab/view-guards.js';
import type { Managers } from '../managers.js';

export type EditorSyncToken = {
  runtime: TabRuntime;
  generation: number;
};

export function beginEditorSync(tab: EditorTab): EditorSyncToken {
  const runtime = tabRuntime(tab);
  runtime.editorSyncGeneration = (runtime.editorSyncGeneration ?? 0) + 1;
  return { runtime, generation: runtime.editorSyncGeneration };
}

export function currentEditorForSync(managers: Managers, token: EditorSyncToken) {
  if (token.runtime.closing || token.runtime.editorSyncGeneration !== token.generation) return;
  return managers.tab.tabs.find((tab): tab is EditorTab =>
    tab.runtime === token.runtime && isEditorTab(tab) && tab.editor.sync !== undefined);
}
