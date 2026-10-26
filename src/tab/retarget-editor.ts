import path from 'node:path';
import type { Tab } from './types.js';
import { messageBus } from '../bus.js';
import { containedAbsolute } from '../path-containment.js';

export function retargetEditorTab(
  tabs: Tab[], oldAbsPath: string, newAbsPath: string,
  replaceFile: (reference: string, absPath: string) => string,
  watch: (label: string, filePath: string) => void,
): void {
  for (const tab of tabs) {
    const editor = tab.editor;
    if (!editor || !containedAbsolute(oldAbsPath, editor.path)) continue;
    const relative = path.relative(oldAbsPath, editor.path);
    const updatedPath = relative ? path.join(newAbsPath, relative) : newAbsPath;
    const name = path.basename(updatedPath);
    tab.editor = {
      ...editor,
      path: updatedPath,
      name,
      url: replaceFile(editor.url, updatedPath),
    };
    tab.title = name;
    watch(tab.label, updatedPath);
    messageBus.emit('state', { type: 'dirty' });
  }
}
