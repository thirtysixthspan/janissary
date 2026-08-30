import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { FileSystemPort } from './filesystem-port.js';
import {
  clearRemoteFileCacheForWorkspace, initRemoteFileCache, materializeRemoteFile, remoteFileFor,
} from './remote-file-cache.js';
import { saveFile } from '../editor/save.js';
import { openNavigatorFile } from './manager-files.js';
import type { FilesTabState } from './state.js';
import { notificationsTab, openNotificationsTab } from '../notifications-tab.js';

function setup(writeFile: FileSystemPort['writeFile']) {
  const project = mkdtempSync(path.join(tmpdir(), 'janus-remote-cache-'));
  initRemoteFileCache(project);
  const filesystem = { writeFile } as FileSystemPort;
  const file = materializeRemoteFile(
    'devbox', 'claude', 'src/notes.txt', Buffer.from('remote'),
    { filesystem, root: '/remote/ws', relPath: 'src/notes.txt', label: 'files' },
  );
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: vi.fn(), markSaved: vi.fn() } as unknown as Managers['editorWatch'];
  const url = managers.tab.registerFile(file);
  managers.tab.openEditorTab({ name: 'notes.txt', path: file, size: '6 B', url });
  return { managers, file, url };
}

function openHarness(readFile: FileSystemPort['readFile']) {
  const project = mkdtempSync(path.join(tmpdir(), 'janus-remote-open-'));
  initRemoteFileCache(project);
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.openFile = { edit: vi.fn(), run: vi.fn() } as unknown as Managers['openFile'];
  managers.remote = { workspaceLabelOf: vi.fn(() => 'creator') } as unknown as Managers['remote'];
  const state = {
    root: '/remote/ws', remote: { host: 'devbox', address: 'devbox' }, ownerLabel: 'joined',
    filesystem: { readFile } as FileSystemPort,
  } as FilesTabState;
  return { managers, state };
}

describe('remote file cache', () => {
  it('keeps the relative path and registration metadata', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    expect(file).toMatch(/remote-files\/devbox\/claude\/src\/notes\.txt$/);
    expect(readFileSync(file, 'utf8')).toBe('remote');
    expect(remoteFileFor(file)?.relPath).toBe('src/notes.txt');
  });

  it('materializes remote content under the canonical workspace before opening it', async () => {
    const readFile = vi.fn().mockResolvedValue(Buffer.from('from remote'));
    const { managers, state } = openHarness(readFile);
    await openNavigatorFile(managers, state, 'files', 'src/notes.txt', 'edit');
    expect(managers.remote.workspaceLabelOf).toHaveBeenCalledWith('joined');
    expect(managers.openFile.edit).toHaveBeenCalledWith(
      expect.stringContaining('/remote-files/devbox/creator/src/notes.txt'),
      expect.stringContaining('/remote-files/devbox/creator/src/notes.txt'),
      'files',
    );
  });

  it('refuses open external without reading or opening the remote file', () => {
    const readFile = vi.fn();
    const { managers, state } = openHarness(readFile);
    openNotificationsTab(managers);
    openNavigatorFile(managers, state, 'files', 'src/notes.txt', 'open external');
    expect(readFile).not.toHaveBeenCalled();
    expect(managers.openFile.run).not.toHaveBeenCalled();
    expect(notificationsTab(managers)?.log.at(-1)?.output).toContain('cannot be opened externally');
  });

  it('saves the cache and writes the same content back to the remote port', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true });
    const { managers, file, url } = setup(writeFile);
    await saveFile(managers, url, 'changed');
    expect(readFileSync(file, 'utf8')).toBe('changed');
    expect(writeFile).toHaveBeenCalledWith('/remote/ws', 'src/notes.txt', Buffer.from('changed'));
  });

  it('keeps the editor draft when remote write-back fails', async () => {
    const { managers, url } = setup(vi.fn().mockResolvedValue({ ok: false, reason: 'read only' }));
    openNotificationsTab(managers);
    const tab = managers.tab.tabs.find((candidate) => candidate.editor);
    tab!.editorDraft = { content: 'changed', updatedAt: Date.now() };
    await expect(saveFile(managers, url, 'changed')).rejects.toThrow('read only');
    expect(tab?.editorDraft?.content).toBe('changed');
    expect(notificationsTab(managers)?.log.at(-1)?.output).toContain('Could not save remote file: read only');
  });

  it('removes one workspace without retaining its records', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    clearRemoteFileCacheForWorkspace('devbox', 'claude');
    expect(remoteFileFor(file)).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });
});
