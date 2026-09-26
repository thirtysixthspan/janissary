import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNavigatorDirectory, createNavigatorFile, openNavigatorFile } from './files.js';
import { initRemoteFileCache } from '../remote/file-cache.js';
import { NOTIFICATIONS_LABEL } from '../../notifications/tab.js';
import { NotificationQueue } from '../../notifications/queue.js';
import type { FilesTabState } from '../state.js';
import type { FileSystemPort } from '../filesystem-port.js';
import type { Managers } from '../../managers.js';

let projects: string[] = [];

afterEach(() => {
  for (const project of projects) rmSync(project, { recursive: true, force: true });
  projects = [];
});

function project(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'janus-manager-files-'));
  projects.push(created);
  return created;
}

function makeManagers() {
  const active = { label: 'files', dotColor: 'blue', log: [] };
  const notifications = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
  const editor = { label: 'editor-1', log: [], editor: { path: '' } };
  const tabs = [active, notifications, editor];
  const edit = vi.fn(() => editor);
  const run = vi.fn();
  const append = vi.fn();
  const workspaceLabelOf = vi.fn(() => 'creator' as string | undefined);
  const managers = {
    tab: { tabs, cur: () => active, byLabel: () => active, append },
    openFile: { edit, run },
    remote: { workspaceLabelOf },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  return { managers, edit, run, append, workspaceLabelOf, editor };
}

function stateFor(filesystem: Partial<FileSystemPort>, ownerLabel?: string): FilesTabState {
  return { root: project(), filesystem, ownerLabel } as unknown as FilesTabState;
}

function remoteState(filesystem: Partial<FileSystemPort>, ownerLabel?: string): FilesTabState {
  return {
    root: '/remote/ws', filesystem, ownerLabel, remote: { host: 'devbox', address: 'devbox' },
  } as unknown as FilesTabState;
}

const readFile = () => vi.fn().mockResolvedValue(Buffer.from('remote bytes'));

describe('openNavigatorFile', () => {
  it('opens a local file for edit in a tab of its own', () => {
    const { managers, edit, run } = makeManagers();
    const state = stateFor({});
    openNavigatorFile(managers, state, 'files', 'src/a.ts', 'edit');
    const absolute = path.join(state.root, 'src/a.ts');
    expect(edit).toHaveBeenCalledWith(`edit ${absolute}`, absolute, 'files');
    expect(run).not.toHaveBeenCalled();
  });

  it('runs a local file under the chosen opener rather than editing it', () => {
    const { managers, edit, run } = makeManagers();
    const state = stateFor({});
    openNavigatorFile(managers, state, 'files', 'src/a.ts', 'preview');
    expect(run).toHaveBeenCalledWith(`preview ${path.join(state.root, 'src/a.ts')}`, 'files');
    expect(edit).not.toHaveBeenCalled();
  });

  it('caches a remote file under the workspace the remote names', async () => {
    initRemoteFileCache(project());
    const { managers, edit, workspaceLabelOf } = makeManagers();
    await openNavigatorFile(managers, remoteState({ readFile: readFile() }, 'joined'), 'files', 'a.ts', 'edit');
    expect(workspaceLabelOf).toHaveBeenCalledWith('joined');
    expect(edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/creator/a.ts'), expect.any(String), 'files',
    );
  });

  // A remote that cannot name the workspace it served the tree from is not a reason to refuse the
  // open: the cache keys the file under the navigator's owner, or failing that its own label.
  it('falls back to the navigator owner, then to its own label, when the remote names no workspace', async () => {
    initRemoteFileCache(project());
    const owned = makeManagers();
    owned.workspaceLabelOf.mockReturnValue(undefined);
    await openNavigatorFile(owned.managers, remoteState({ readFile: readFile() }, 'joined'), 'files', 'a.ts', 'edit');
    expect(owned.edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/joined/a.ts'), expect.any(String), 'files',
    );

    const orphan = makeManagers();
    orphan.workspaceLabelOf.mockReturnValue(undefined);
    await openNavigatorFile(orphan.managers, remoteState({ readFile: readFile() }), 'files', 'a.ts', 'edit');
    expect(orphan.edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/files/a.ts'), expect.any(String), 'files',
    );
  });
});

describe('createNavigatorFile', () => {
  it('reports the refusal and opens nothing when the filesystem refuses', () => {
    const { managers, edit, append } = makeManagers();
    const createFile = vi.fn(() => ({ ok: false, reason: 'a file already holds that name' }));
    expect(createNavigatorFile(managers, stateFor({ createFile }), 'files', 'a.ts')).toBeUndefined();
    expect(edit).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL, expect.objectContaining({ output: 'a file already holds that name' }), expect.any(Number),
    );
  });

  it('opens a newly created local file for edit', async () => {
    const { managers, edit } = makeManagers();
    const state = stateFor({ createFile: vi.fn(() => ({ ok: true, value: { path: 'src/new.ts' } })) });
    await createNavigatorFile(managers, state, 'files', 'src/new.ts');
    const absolute = path.join(state.root, 'src/new.ts');
    expect(edit).toHaveBeenCalledWith(`edit ${absolute}`, absolute, 'files');
  });

  // A remote file has no bytes on this machine yet, so the create materializes an empty one in the
  // cache and marks the tab it opens as holding a new file — the editor needs that to offer a save
  // rather than treating the tab as a read-only view of bytes that do not exist locally.
  it('materializes an empty remote file and marks the editor tab as new', async () => {
    initRemoteFileCache(project());
    const { managers, edit, editor, workspaceLabelOf } = makeManagers();
    const state = remoteState({ createFile: vi.fn(() => ({ ok: true, value: { path: 'src/new.ts' } })) }, 'joined');
    await createNavigatorFile(managers, state, 'files', 'src/new.ts');
    expect(workspaceLabelOf).toHaveBeenCalledWith('joined');
    expect(edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/creator/src/new.ts'), expect.any(String), 'files',
    );
    expect(editor.editor).toMatchObject({ newFile: true });
  });

  it('falls back to the navigator owner, then to its own label, when the remote names no workspace', async () => {
    initRemoteFileCache(project());
    const created = () => vi.fn(() => ({ ok: true, value: { path: 'a.ts' } }));
    const owned = makeManagers();
    owned.workspaceLabelOf.mockReturnValue(undefined);
    await createNavigatorFile(owned.managers, remoteState({ createFile: created() }, 'joined'), 'files', 'a.ts');
    expect(owned.edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/joined/a.ts'), expect.any(String), 'files',
    );

    const orphan = makeManagers();
    orphan.workspaceLabelOf.mockReturnValue(undefined);
    await createNavigatorFile(orphan.managers, remoteState({ createFile: created() }), 'files', 'a.ts');
    expect(orphan.edit).toHaveBeenCalledWith(
      expect.stringContaining('remote-files/devbox/files/a.ts'), expect.any(String), 'files',
    );
  });
});

describe('createNavigatorDirectory', () => {
  it('reports the refusal and rebuilds nothing when the filesystem refuses', async () => {
    const { managers, append } = makeManagers();
    const createDirectory = vi.fn(() => ({ ok: false, reason: 'a file already holds that name' }));
    const rebuild = vi.fn();
    const state = stateFor({ createDirectory });
    expect(await createNavigatorDirectory(managers, state, 'files', 'src', rebuild)).toBeUndefined();
    expect(rebuild).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      NOTIFICATIONS_LABEL, expect.objectContaining({ output: 'a file already holds that name' }), expect.any(Number),
    );
  });

  it('rebuilds and answers the created path on success', async () => {
    const { managers } = makeManagers();
    const createDirectory = vi.fn(() => ({ ok: true, value: { path: 'src/new' } }));
    const rebuild = vi.fn();
    const state = stateFor({ createDirectory });
    expect(await createNavigatorDirectory(managers, state, 'files', 'src/new', rebuild)).toBe('src/new');
    expect(createDirectory).toHaveBeenCalledWith(state.root, 'src/new');
    expect(rebuild).toHaveBeenCalledOnce();
  });
});
