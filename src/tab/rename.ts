import type { Tab } from './types.js';
import { messageBus } from '../bus.js';
import { renameEditorTab } from './rename-editor.js';
import { isReservedTabLabel, RESERVED_SYSTEM_LABEL_REFUSAL } from './reserved-label.js';

// Resolves TabManager.renameTab: editor tabs delegate to renameEditorTab (which also renames
// the file on disk); plain tabs just trim/assign (or clear, if the trimmed value matches the
// tab's label) a display title. Both branches emit `state:dirty`. A refused editor rename
// changes nothing, still emits `state:dirty`, and returns the refusal text.
export function renameTabOp(
  tabs: Tab[],
  index: number,
  title: string,
  maxLength: number,
  replaceFile: (reference: string, absPath: string) => string,
  watchEditor: (label: string, filePath: string) => void,
  isWriting: (filePath: string) => boolean,
): string | undefined {
  const tab = tabs[index];
  if (!tab) return undefined;
  const trimmed = title.trim().slice(0, maxLength);
  if (isReservedTabLabel(trimmed) && !(tab.systemShell && trimmed === tab.label)) {
    return RESERVED_SYSTEM_LABEL_REFUSAL;
  }
  if (tab.editor) {
    const refusal = renameEditorTab(tab, title, maxLength, replaceFile, watchEditor, isWriting);
    messageBus.emit('state', { type: 'dirty' });
    return refusal;
  }
  if (trimmed && trimmed !== tab.label) tab.title = trimmed;
  else delete tab.title;
  messageBus.emit('state', { type: 'dirty' });
  return undefined;
}
