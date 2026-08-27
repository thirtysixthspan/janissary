import type { Tab } from './types.js';
import type { AgentState } from '../agent/types.js';
import { messageBus } from '../bus.js';
import { renameEditorTab } from './rename-editor.js';

// Resolves TabManager.renameTab: editor tabs delegate to renameEditorTab (which also renames
// the file on disk); plain tabs just trim/assign (or clear, if the trimmed value matches the
// tab's label) a display title. Both branches persist and emit `state:dirty`.
export function renameTabOp(
  tabs: Tab[],
  index: number,
  title: string,
  maxLength: number,
  replaceFile: (reference: string, absPath: string) => string,
  watchEditor: (label: string, filePath: string) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
): void {
  const tab = tabs[index];
  if (!tab) return;
  if (tab.editor) {
    renameEditorTab(tab, title, maxLength, replaceFile, watchEditor);
    persist(buildAgentState(tab));
    messageBus.emit('state', { type: 'dirty' });
    return;
  }
  const trimmed = title.trim().slice(0, maxLength);
  if (trimmed && trimmed !== tab.label) tab.title = trimmed;
  else delete tab.title;
  persist(buildAgentState(tab));
  messageBus.emit('state', { type: 'dirty' });
}
