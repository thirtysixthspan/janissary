import { closeConnection } from '../connection/close.js';
import { editorSuggest, ownerLabel, type EditorSuggestParams, type EditorSuggestResult } from '../editor-suggest/handler.js';
import { saveFile } from '../editor/save.js';
import { renameEditorFile } from '../editor/rename.js';
import { commitEditorFile } from '../editor/commit.js';
import { resyncEditorTab } from '../editor/resync.js';
import { syncEditorBuffer } from '../editor/sync.js';
import { notify } from '../notifications.js';
import { listPersonas } from '../personas.js';
import { projectFilesFor } from '../project/files.js';
import type { Managers } from '../managers.js';
import type { MaybePromise } from '../maybe-promise.js';

export type EditorControllerAdapter = {
  saveFile(url: string, content: string): MaybePromise<void>;
  syncEditorBuffer(url: string, content: string): void;
  resyncEditorTab(url: string): void;
  projectFiles(): Promise<{ root: string; paths: string[] }>;
  projectFilesFallback(): { root: string; paths: string[] };
  editorPersonas(): string[];
  editorSuggest(params: EditorSuggestParams, callback: (result: EditorSuggestResult) => void): void;
  closeEditorConnection(url: string, persona: string): void;
  editorPluginFailed(url: string, plugin: string, reason: string): void;
  renameEditorFile(url: string, name: string): void;
  commitEditorFile(url: string, message: string): void;
};

export function createEditorControllerAdapter(managers: Managers): EditorControllerAdapter {
  return {
    saveFile: (url, content) => saveFile(managers, url, content),
    syncEditorBuffer: (url, content) => syncEditorBuffer(managers, url, content),
    resyncEditorTab: (url) => { void resyncEditorTab(managers, url); },
    projectFiles: () => projectFilesFor(managers),
    projectFilesFallback: () => ({ root: managers.tab.launchDir, paths: [] }),
    editorPersonas: () => listPersonas('editor'),
    editorSuggest: (params, callback) => editorSuggest(managers, params, callback),
    closeEditorConnection: (url, persona) => closeConnection('acp', persona, managers, ownerLabel(managers, url), () => { /* no-op */ }),
    editorPluginFailed: (url, plugin, reason) => {
      notify(
        managers, 'plugin-failure', ownerLabel(managers, url),
        `Editor plugin "${plugin}" disabled: ${reason}.`,
      );
    },
    renameEditorFile: (url, name) => renameEditorFile(managers, url, name),
    commitEditorFile: (url, message) => commitEditorFile(managers, url, message),
  };
}
