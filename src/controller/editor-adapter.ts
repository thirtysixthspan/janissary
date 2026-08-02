import { closeConnection } from '../connection/close.js';
import { editorSuggest, ownerLabel, type EditorSuggestParams, type EditorSuggestResult } from '../editor-suggest/handler.js';
import { saveFile } from '../editor/save.js';
import { saveVideoShot } from '../video-shot.js';
import { resyncEditorTab } from '../editor/resync.js';
import { syncEditorBuffer } from '../editor/sync.js';
import { listPersonas } from '../personas.js';
import { projectFilesFor } from '../project-files.js';
import { syncPageSnapshot } from '../page/sync.js';
import type { Managers } from '../managers.js';

export type EditorControllerAdapter = {
  saveFile(url: string, content: string): void;
  captureVideoFrame(url: string, dataUrl: string): string;
  syncEditorBuffer(url: string, content: string): void;
  resyncEditorTab(url: string): void;
  syncPageSnapshot(url: string, text: string): void;
  projectFiles(): Promise<{ root: string; paths: string[] }>;
  projectFilesFallback(): { root: string; paths: string[] };
  editorPersonas(): string[];
  editorSuggest(params: EditorSuggestParams, callback: (result: EditorSuggestResult) => void): void;
  closeEditorConnection(url: string, persona: string): void;
};

export function createEditorControllerAdapter(managers: Managers): EditorControllerAdapter {
  return {
    saveFile: (url, content) => saveFile(managers, url, content),
    captureVideoFrame: (url, dataUrl) => saveVideoShot(managers, url, dataUrl),
    syncEditorBuffer: (url, content) => syncEditorBuffer(managers, url, content),
    resyncEditorTab: (url) => { void resyncEditorTab(managers, url); },
    syncPageSnapshot: (url, text) => syncPageSnapshot(managers, url, text),
    projectFiles: () => projectFilesFor(managers),
    projectFilesFallback: () => ({ root: managers.tab.launchDir, paths: [] }),
    editorPersonas: () => listPersonas('editor'),
    editorSuggest: (params, callback) => editorSuggest(managers, params, callback),
    closeEditorConnection: (url, persona) => closeConnection('acp', persona, managers, ownerLabel(managers, url), () => { /* no-op */ }),
  };
}
