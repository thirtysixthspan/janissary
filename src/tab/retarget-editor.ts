import path from 'node:path';
import type { Tab } from './types.js';
import { messageBus } from '../bus.js';

export function retargetEditorTab(
  tabs: Tab[], oldAbsPath: string, newAbsPath: string,
  replaceFile: (reference: string, absPath: string) => string,
  watch: (label: string, filePath: string) => void,
): void {
  const tab = tabs.find((candidate) => candidate.editor?.path === oldAbsPath);
  if (!tab?.editor) return;
  const name = path.basename(newAbsPath);
  tab.editor = {
    ...tab.editor,
    path: newAbsPath,
    name,
    url: replaceFile(tab.editor.url, newAbsPath),
  };
  tab.title = name;
  watch(tab.label, newAbsPath);
  messageBus.emit('state', { type: 'dirty' });
}
