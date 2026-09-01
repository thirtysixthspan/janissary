import path from 'node:path';
import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';
import type { FileOpenerChoice } from '../protocol.js';
import { mapMaybe, type MaybePromise } from '../maybe-promise.js';
import { materializeRemoteFile } from './remote-file-cache.js';
import type { FilesTabState } from './state.js';

export function openNavigatorFile(
  managers: Managers, state: FilesTabState, label: string, relPath: string,
  command: FileOpenerChoice['command'],
): MaybePromise<void> {
  const remote = state.remote;
  if (!remote) {
    openMaterialized(managers, label, path.resolve(state.root, relPath), command);
    return;
  }
  if (command === 'open external') {
    notify(managers, 'file-operation', label, 'Remote files cannot be opened externally. Edit or open the file in a tab instead.');
    return;
  }
  return mapMaybe(state.filesystem.readFile(state.root, relPath), (content) => {
    const workspaceLabel = managers.remote.workspaceLabelOf(state.ownerLabel ?? label) ?? state.ownerLabel ?? label;
    const file = materializeRemoteFile(
      remote.host, workspaceLabel, relPath, content,
      { filesystem: state.filesystem, root: state.root, relPath, label },
    );
    openMaterialized(managers, label, file, command);
  });
}

export function createNavigatorFile(
  managers: Managers, state: FilesTabState, label: string, destination: string,
): MaybePromise<void> {
  return mapMaybe(state.filesystem.createFile(state.root, destination), (result) => {
    if (!result.ok) { notify(managers, 'file-operation', label, result.reason); return; }
    if (!state.remote) { void openNavigatorFile(managers, state, label, result.value.path, 'edit'); return; }
    const workspaceLabel = managers.remote.workspaceLabelOf(state.ownerLabel ?? label) ?? state.ownerLabel ?? label;
    const file = materializeRemoteFile(
      state.remote.host, workspaceLabel, result.value.path, new Uint8Array(),
      { filesystem: state.filesystem, root: state.root, relPath: result.value.path, label },
    );
    const opened = managers.openFile.edit(`edit ${file}`, file, label);
    const tab = opened && managers.tab.tabs.find((candidate) => candidate.label === opened.label);
    if (tab?.editor) tab.editor = { ...tab.editor, newFile: true };
  });
}

export function createNavigatorDirectory(
  managers: Managers, state: FilesTabState, label: string, destination: string, rebuild: () => void,
): MaybePromise<string | undefined> {
  return mapMaybe(state.filesystem.createDirectory(state.root, destination), (result) => {
    if (!result.ok) { notify(managers, 'file-operation', label, result.reason); return; }
    rebuild();
    return result.value.path;
  });
}

function openMaterialized(
  managers: Managers, label: string, file: string, command: FileOpenerChoice['command'],
): void {
  if (command === 'edit') { managers.openFile.edit(`edit ${file}`, file, label); return; }
  void managers.openFile.run(`${command} ${file}`, label);
}
