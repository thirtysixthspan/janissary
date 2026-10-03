import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TabManager } from '../../tab/manager.js';
import type { Managers } from '../../managers.js';
import type { FileSystemPort } from '../filesystem-port.js';
import {
  clearRemoteFileCache, clearRemoteFileCacheForWorkspace, forgetRemoteFilesOf, initRemoteFileCache,
  isRemoteCacheFile, materializeRemoteFile, remoteFileFor,
} from './file-cache.js';
import { saveFile } from '../../editor/save.js';
import { openNavigatorFile } from '../manager/files.js';
import type { FilesTabState } from '../state.js';
import { notificationsTab, openNotificationsTab } from '../../notifications/tab.js';
import { NotificationQueue } from '../../notifications/queue.js';

function setup(writeFile: FileSystemPort['writeFile']) {
  const project = mkdtempSync(path.join(tmpdir(), 'janus-remote-cache-'));
  initRemoteFileCache(project);
  const filesystem = { writeFile } as FileSystemPort;
  const file = materializeRemoteFile(
    'devbox', 'claude', 'src/notes.txt', Buffer.from('remote'),
    { filesystem, root: '/remote/ws', relPath: 'src/notes.txt', label: 'files' },
  );
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
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
  managers.notifications = new NotificationQueue();
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
  it('keeps same-named files at different roots separate and saves to their original destinations', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true });
    const { managers, file, url } = setup(writeFile);
    const filesystem = remoteFileFor(file)!.filesystem;
    const second = materializeRemoteFile('devbox', 'claude', 'src/notes.txt', Buffer.from('other'), {
      filesystem, root: '/remote/ws/subdir', relPath: 'src/notes.txt', label: 'files',
    });
    const secondUrl = managers.tab.registerFile(second);
    managers.tab.openEditorTab({ name: 'notes.txt', path: second, size: '5 B', url: secondUrl });

    expect(second).not.toBe(file);
    expect(readFileSync(file, 'utf8')).toBe('remote');
    expect(readFileSync(second, 'utf8')).toBe('other');
    await saveFile(managers, url, 'first edit');
    await saveFile(managers, secondUrl, 'second edit');
    expect(writeFile.mock.calls).toEqual([
      ['/remote/ws', 'src/notes.txt', Buffer.from('first edit')],
      ['/remote/ws/subdir', 'src/notes.txt', Buffer.from('second edit')],
    ]);
    clearRemoteFileCacheForWorkspace('devbox', 'claude');
    expect(existsSync(file)).toBe(false);
    expect(existsSync(second)).toBe(false);
  });

  it('reuses the same cache identity when two roots reach the same remote file', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    const record = remoteFileFor(file)!;
    const same = materializeRemoteFile('devbox', 'claude', 'notes.txt', Buffer.from('refreshed'), {
      ...record, root: '/remote/ws/src', relPath: 'notes.txt',
    });
    expect(same).toBe(file);
    expect(readFileSync(file, 'utf8')).toBe('refreshed');
    expect(remoteFileFor(file)).toMatchObject({ root: '/remote/ws/src', relPath: 'notes.txt' });
  });

  it('keeps the relative path and registration metadata', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    expect(file).toMatch(/remote-files\/devbox\/claude\/[a-f0-9]{64}\/notes\.txt$/);
    expect(readFileSync(file, 'utf8')).toBe('remote');
    expect(remoteFileFor(file)?.relPath).toBe('src/notes.txt');
  });

  it('materializes remote content under the canonical workspace before opening it', async () => {
    const readFile = vi.fn().mockResolvedValue(Buffer.from('from remote'));
    const { managers, state } = openHarness(readFile);
    await openNavigatorFile(managers, state, 'files', 'src/notes.txt', 'edit');
    expect(managers.remote.workspaceLabelOf).toHaveBeenCalledWith('joined');
    expect(managers.openFile.edit).toHaveBeenCalledWith(
      expect.stringMatching(/remote-files\/devbox\/creator\/[a-f0-9]{64}\/notes\.txt$/),
      expect.stringMatching(/remote-files\/devbox\/creator\/[a-f0-9]{64}\/notes\.txt$/),
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

  // The cached copy follows the remote rather than leading it, so a write the remote refuses leaves
  // the two agreeing instead of the local copy holding content the remote never received.
  it('leaves the cached copy unchanged when the remote refuses the write', async () => {
    const { managers, file, url } = setup(vi.fn().mockResolvedValue({ ok: false, reason: 'read only' }));
    await expect(saveFile(managers, url, 'changed')).rejects.toThrow('read only');
    expect(readFileSync(file, 'utf8')).toBe('remote');
  });

  it('forgets the files that wrote back through a disposed port, and only those', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    const other = materializeRemoteFile(
      'devbox', 'claude', 'src/other.txt', Buffer.from('x'),
      { filesystem: {} as FileSystemPort, root: '/remote/ws', relPath: 'src/other.txt', label: 'files-2' },
    );
    const disposed = remoteFileFor(file)!.filesystem;

    forgetRemoteFilesOf(disposed);

    expect(remoteFileFor(file)).toBeUndefined();
    expect(remoteFileFor(other)).toBeDefined();
    expect(isRemoteCacheFile(file)).toBe(true);
    expect(existsSync(file)).toBe(true);
  });

  // With its navigator gone the copy has no route back; a local-only save would report the file saved
  // while the remote kept the old content.
  it('refuses to save a cached copy whose navigator has closed, and leaves it unchanged', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true });
    const { managers, file, url } = setup(writeFile);
    openNotificationsTab(managers);
    forgetRemoteFilesOf(remoteFileFor(file)!.filesystem);

    expect(() => saveFile(managers, url, 'changed')).toThrow('file navigator is closed');
    expect(writeFile).not.toHaveBeenCalled();
    expect(readFileSync(file, 'utf8')).toBe('remote');
    expect(notificationsTab(managers)?.log.at(-1)?.output).toContain('file navigator is closed');
  });

  it('counts only paths inside the cache as cached remote files', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    expect(isRemoteCacheFile(file)).toBe(true);
    expect(isRemoteCacheFile(path.join(tmpdir(), 'notes.txt'))).toBe(false);
  });

  it('removes one workspace without retaining its records', () => {
    const { file } = setup(vi.fn(() => ({ ok: true })));
    clearRemoteFileCacheForWorkspace('devbox', 'claude');
    expect(remoteFileFor(file)).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });
});

// The cache root and the record table are module state, so each of these needs a fresh import to
// stand where a process that has not yet run its boot sequence stands.
async function uninitialized() {
  vi.resetModules();
  return import('./file-cache.js');
}

const record = { filesystem: {} as FileSystemPort, root: '/ws', relPath: 'a.txt', label: 'files' };

describe('materializeRemoteFile before the cache is initialized', () => {
  it('refuses rather than writing outside any cache root', async () => {
    const fresh = await uninitialized();
    expect(() => { fresh.materializeRemoteFile('devbox', 'claude', 'a.txt', Buffer.from('x'), record); })
      .toThrow('Remote file cache is not initialized.');
  });
});

describe('materializeRemoteFile outside the cache', () => {
  // The relPath comes from a remote's own answer, so a `..` in it has to be refused here rather
  // than trusted: the cache is a real directory on this machine, and `records` is what the editor
  // later reads a file's owner out of.
  it('refuses a relPath that climbs out of the workspace', () => {
    initRemoteFileCache(mkdtempSync(path.join(tmpdir(), 'janus-remote-cache-')));
    expect(() => { materializeRemoteFile('devbox', 'claude', '../escaped.txt', Buffer.from('x'), record); })
      .toThrow('The path is outside the remote file cache.');
  });

  it('sanitizes a host or workspace label that holds path separators', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'janus-remote-cache-'));
    initRemoteFileCache(project);
    const file = materializeRemoteFile('../devbox', 'a/b', 'a.txt', Buffer.from('x'), record);
    expect(file).toContain(path.join('remote-files', '.._devbox', 'a_b'));
    expect(existsSync(file)).toBe(true);
  });
});

describe('clearRemoteFileCacheForWorkspace before the cache is initialized', () => {
  it('removes nothing and throws nothing', async () => {
    const fresh = await uninitialized();
    expect(() => { fresh.clearRemoteFileCacheForWorkspace('devbox', 'claude'); }).not.toThrow();
  });
});

describe('clearRemoteFileCache', () => {
  it('removes every workspace and forgets every record', () => {
    const first = setup(vi.fn(() => ({ ok: true })));
    const kept = remoteFileFor(first.file);
    expect(kept).toBeDefined();

    clearRemoteFileCache();

    expect(remoteFileFor(first.file)).toBeUndefined();
    expect(existsSync(first.file)).toBe(false);
  });

  it('removes nothing and throws nothing before the cache is initialized', async () => {
    const fresh = await uninitialized();
    expect(() => { fresh.clearRemoteFileCache(); }).not.toThrow();
  });
});
