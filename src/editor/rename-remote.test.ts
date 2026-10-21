import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import { initRemoteFileCache } from '../file-navigator/remote/file-cache.js';
import { createNavigatorFile } from '../file-navigator/manager/files.js';
import type { FilesTabState } from '../file-navigator/state.js';
import { NotificationQueue } from '../notifications/queue.js';
import { renameEditorFile } from './rename.js';
import { saveFile } from './save.js';

function setup() {
  const project = mkdtempSync(path.join(tmpdir(), 'janus-remote-rename-'));
  initRemoteFileCache(project);
  const writeFile = vi.fn().mockResolvedValue({ ok: true });
  const rename = vi.fn().mockResolvedValue({ ok: true, value: ['untitled.md', 'plan.md'] });
  const createFile = vi.fn().mockResolvedValue({ ok: true, value: { path: 'untitled.md' } });
  const filesystem = { writeFile, rename, createFile } as unknown as FileSystemPort;
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers);
  managers.editorWatch = { watch: vi.fn(), markSaved: vi.fn() } as unknown as Managers['editorWatch'];
  managers.shellTranscript = { isWriting: () => false } as unknown as Managers['shellTranscript'];
  managers.schedule = { get: vi.fn() } as unknown as Managers['schedule'];
  managers.openFile = {
    edit: (_command: string, file: string, label: string) => {
      const url = managers.tab.registerFile(file);
      return { label: managers.tab.openEditorTab({ name: path.basename(file), path: file, size: '0 B', url, newFile: false }) ?? label };
    },
  } as unknown as Managers['openFile'];
  managers.remote = {
    entryOf: () => ({ address: { destination: 'devbox' }, workspaceDir: '/remote/ws', workspaceLabel: 'claude' }),
  } as unknown as Managers['remote'];
  const state = { root: '/remote/ws', remote: { host: 'devbox', address: 'devbox' }, filesystem } as FilesTabState;
  return { managers, state, writeFile, rename };
}

describe('renaming a new file created from a remote navigator', () => {
  it('still saves the renamed file to the remote workspace', async () => {
    const { managers, state, writeFile, rename } = setup();
    await createNavigatorFile(managers, state, 'files', 'untitled.md');
    const tab = managers.tab.tabs.find((candidate) => candidate.editor)!;
    const url = tab.editor!.url;

    renameEditorFile(managers, url, 'plan.md');
    await saveFile(managers, tab.editor!.url, 'hello');

    expect(rename).toHaveBeenCalledWith('/remote/ws', 'untitled.md', 'plan.md');
    expect(writeFile).toHaveBeenCalledWith('/remote/ws', 'plan.md', Buffer.from('hello'));
    expect(readFileSync(tab.editor!.path, 'utf8')).toBe('hello');
  });
});
