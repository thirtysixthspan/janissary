import { existsSync, lstatSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { Tab } from './types.js';
import {
  INVALID_NAME_REASON,
  LIVE_SHELL_TRANSCRIPT_REASON,
  NAME_TAKEN_REASON,
} from '../file-navigator/file-operation-result.js';

function lstatOrUndefined(filePath: string): { dev: number; ino: number } | undefined {
  try {
    return lstatSync(filePath);
  } catch {
    return undefined;
  }
}

function invalidName(name: string): boolean {
  return name.includes('/') || name.includes(path.sep) || name === '.' || name === '..';
}

function destinationTaken(source: string, destination: string): boolean {
  const target = lstatOrUndefined(destination);
  if (!target) return false;
  const current = lstatOrUndefined(source);
  return !current || current.dev !== target.dev || current.ino !== target.ino;
}

function refusalReason(
  source: string, destination: string, name: string, isWriting: (filePath: string) => boolean,
): string | undefined {
  if (invalidName(name)) return INVALID_NAME_REASON;
  if (destinationTaken(source, destination)) return NAME_TAKEN_REASON;
  if (isWriting(source)) return LIVE_SHELL_TRANSCRIPT_REASON;
  return undefined;
}

// Rename branch for any editor tab: the tab label sets the filename literally (no extension
// appended), rather than acting as a display-only alias — editor tabs represent a file on disk,
// so there is no separate alias concept. Before the file exists on disk this just updates the
// pending target path; once it exists, the file is renamed on disk and the editor retargeted to
// the new path. A name that would leave the folder or replace another entry is refused, the tab
// and file stay untouched, and the refusal text is returned for the caller to surface. So is a file a
// shell transcript writer still appends to: the writer would follow the moved file while the shell
// tab's button and the live-transcript save refusal still name the old path.
export function renameEditorTab(
  tab: Tab,
  title: string,
  maxLength: number,
  replaceFile: (reference: string, absPath: string) => string,
  rewatch: (label: string, filePath: string) => void,
  isWriting: (filePath: string) => boolean,
): string | undefined {
  const editor = tab.editor;
  if (!editor) return undefined;
  const trimmed = title.trim().slice(0, maxLength);
  if (!trimmed || trimmed === editor.name) return undefined;
  const newPath = path.join(path.dirname(editor.path), trimmed);
  const reason = refusalReason(editor.path, newPath, trimmed, isWriting);
  if (reason) return `Could not rename ${editor.name} to ${trimmed}. ${reason}.`;
  if (existsSync(editor.path)) renameSync(editor.path, newPath);
  tab.editor = { ...editor, path: newPath, name: trimmed, url: replaceFile(editor.url, newPath) };
  tab.title = trimmed;
  rewatch(tab.label, newPath);
  return undefined;
}
