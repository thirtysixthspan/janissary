import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { Tab } from '../types.js';

// Rename branch for any editor tab: the tab label sets the filename literally (no extension
// appended), rather than acting as a display-only alias — editor tabs represent a file on disk,
// so there is no separate alias concept. Before the file exists on disk this just updates the
// pending target path; once it exists, the file is renamed on disk and the editor retargeted to
// the new path.
export function renameEditorTab(
  tab: Tab,
  title: string,
  maxLength: number,
  registerFile: (absPath: string) => string,
  rewatch: (label: string, filePath: string) => void,
): void {
  const editor = tab.editor;
  if (!editor) return;
  const trimmed = title.trim().slice(0, maxLength);
  if (!trimmed || trimmed === editor.name) return;
  const newPath = path.join(path.dirname(editor.path), trimmed);
  if (existsSync(editor.path)) renameSync(editor.path, newPath);
  tab.editor = { ...editor, path: newPath, name: trimmed, url: registerFile(newPath) };
  tab.title = trimmed;
  rewatch(tab.label, newPath);
}
