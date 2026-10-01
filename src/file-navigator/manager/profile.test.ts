import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { closeTabState } from './profile.js';
import { initRemoteFileCache, materializeRemoteFile, remoteFileFor } from '../remote/file-cache.js';
import type { FileSystemPort } from '../filesystem-port.js';
import type { FilesTabState } from '../state.js';

describe('closeTabState', () => {
  // A cached file's record names the port it writes back through; closing the navigator disposes that
  // port, so the record has to go with it or a later save would be sent through a dead port.
  it('disposes the tab\'s port and forgets the remote files that wrote back through it', () => {
    initRemoteFileCache(mkdtempSync(path.join(tmpdir(), 'janus-close-state-')));
    const filesystem = { dispose: vi.fn() } as unknown as FileSystemPort;
    const file = materializeRemoteFile(
      'devbox', 'claude', 'a.txt', Buffer.from('x'),
      { filesystem, root: '/remote/ws', relPath: 'a.txt', label: 'files' },
    );
    const state = { filesystem, watchers: new Map() } as unknown as FilesTabState;
    const tabs = new Map([['files', state]]);

    closeTabState(tabs, 'files');

    expect(filesystem.dispose).toHaveBeenCalledOnce();
    expect(remoteFileFor(file)).toBeUndefined();
    expect(tabs.has('files')).toBe(false);
  });
});
