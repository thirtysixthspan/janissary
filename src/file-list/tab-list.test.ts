import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { fakeChannel } from '../testing/fake-remote-channel.js';
import { FILE_LIST_USAGE } from './command.js';
import { listFilesInTab } from './tab-list.js';

const STAMP = Date.parse('2026-11-19T13:50:00Z') / 1000;

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-list-'));
  outside = mkdtempSync(path.join(tmpdir(), 'janus-file-list-out-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function makeFile(relative: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'x');
  chmodSync(target, 0o644);
  utimesSync(target, STAMP, STAMP);
}

function makeDir(relative: string): void {
  mkdirSync(path.join(root, relative), { recursive: true });
}

function fixDir(relative: string): void {
  const target = path.join(root, relative);
  chmodSync(target, 0o755);
  utimesSync(target, STAMP, STAMP);
}

const managersWith = (workspaceDir?: string) => ({
  tab: {
    launchDir: root,
    byLabel: () => ({ label: 'janus', ...(workspaceDir !== undefined && { workspaceDir }) }),
  },
}) as never;

describe('listFilesInTab', () => {
  it('renders one fixed row per entry, directories before files', async () => {
    makeFile('beta.md');
    makeFile('alpha.md');
    makeDir('subdir');
    fixDir('subdir');
    const listed = await listFilesInTab(managersWith(), 'janus', 'file list .');
    const lines = listed.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('dir drwxr-xr-x ')).toBe(true);
    expect(lines[0].endsWith(' 2026-11-19T13:50:00.000Z subdir')).toBe(true);
    expect(lines[1]).toBe('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z alpha.md');
    expect(lines[2]).toBe('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z beta.md');
  });

  it('stats entries relative to the workspace root when listing a subdirectory', async () => {
    makeFile('docs/a.md');
    expect(await listFilesInTab(managersWith(), 'janus', 'file list docs'))
      .toBe('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z a.md');
  });

  it('filters secret names but keeps dotfiles and node_modules', async () => {
    makeFile('.env');
    makeFile('.env.local');
    makeDir('.ssh');
    makeFile('visible.md');
    makeFile('.hidden.md');
    makeDir('node_modules');
    makeFile('node_modules/pkg.md');
    const result = await listFilesInTab(managersWith(), 'janus', 'file ls .');
    expect(result).not.toContain('.env');
    expect(result).not.toContain('.ssh');
    expect(result).toContain('visible.md');
    expect(result).toContain('.hidden.md');
    expect(result).toContain('node_modules');
  });

  it('prints (empty directory) for an empty directory', async () => {
    expect(await listFilesInTab(managersWith(), 'janus', 'file list .')).toBe('(empty directory)');
    makeDir('sub');
    expect(await listFilesInTab(managersWith(), 'janus', 'file list sub')).toBe('(empty directory)');
  });

  it('renders a vanished entry with a zero-valued stat', async () => {
    const port = {
      readDirectory: () => [{ name: 'gone.md', dir: false }],
      statRows: () => ({ 'gone.md': null }),
    } as unknown as FileSystemPort;
    expect(await listFilesInTab(managersWith(), 'janus', 'file list .', port))
      .toBe('file ---------- 0 1970-01-01T00:00:00.000Z gone.md');
  });

  it('prints notdir when the target is a file', async () => {
    makeFile('a.md');
    expect(await listFilesInTab(managersWith(), 'janus', 'file list a.md')).toBe('notdir');
  });

  it('prints missing for an absent path', async () => {
    expect(await listFilesInTab(managersWith(), 'janus', 'file list absent')).toBe('missing');
  });

  it('prints forbidden for out-of-workspace and secret paths', async () => {
    expect(await listFilesInTab(managersWith(), 'janus', 'file list ..')).toBe('forbidden');
    expect(await listFilesInTab(managersWith(), 'janus', `file list ${outside}`)).toBe('forbidden');
    expect(await listFilesInTab(managersWith(), 'janus', 'file list .env')).toBe('forbidden');
  });

  it('resolves to a one-word refusal when the directory read fails', async () => {
    const port = {
      readDirectory: () => { throw new Error('EACCES: permission denied'); },
    } as unknown as FileSystemPort;
    expect(await listFilesInTab(managersWith(), 'janus', 'file list .', port)).toBe('forbidden');
  });

  it('returns the usage line for malformed arguments', async () => {
    expect(await listFilesInTab(managersWith(), 'janus', 'file ls')).toBe(FILE_LIST_USAGE);
    expect(await listFilesInTab(managersWith(), 'janus', 'file list a b')).toBe(FILE_LIST_USAGE);
  });

  it('resolves against the tab workspace or the launch directory', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'janus-file-list-ws-'));
    try {
      writeFileSync(path.join(workspace, 'ws.md'), 'x');
      const withWorkspace = ({
        tab: { launchDir: root, byLabel: () => ({ label: 'janus', workspaceDir: workspace }) },
      }) as never;
      expect(await listFilesInTab(withWorkspace, 'janus', 'file list .')).toContain('ws.md');
      expect(await listFilesInTab(managersWith(), 'janus', 'file list .')).toBe('(empty directory)');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('listFilesInTab on a remote tab', () => {
  const remoteRoot = '/remote/ws';
  let remote: ReturnType<typeof fakeChannel>;

  beforeEach(() => { remote = fakeChannel(); });

  const managers = (hasChannel = true) => ({
    tab: { launchDir: root, byLabel: () => ({ label: 'far', remote: { host: 'box' } }) },
    remote: {
      get: () => hasChannel ? remote.channel : undefined,
      readyOf: () => Promise.resolve(remoteRoot),
      workspaceOf: () => remoteRoot,
    },
  }) as never;

  const start = (line: string, hasChannel = true) => listFilesInTab(managers(hasChannel), 'far', line);
  const replyText = async (line: string, text: string) => {
    const pending = start(line);
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    remote.reply({ text });
    return pending;
  };

  it('returns the far-side directory row verbatim on its own session', async () => {
    makeFile('alpha.md');
    makeDir('subdir');
    fixDir('subdir');
    const local = await listFilesInTab(managersWith(), 'janus', 'file list .');
    expect(await replyText('file list .', local)).toBe(local);
    const [request] = remote.requests();
    expect(request).toMatchObject({ operation: 'list-directory', args: { path: '' } });
    expect(request?.session.startsWith('file-list-')).toBe(true);
    expect(request?.session).not.toBe('far');
  });

  it('returns the far-side (empty directory) and notdir wording', async () => {
    expect(await replyText('file list sub', '(empty directory)')).toBe('(empty directory)');
    remote = fakeChannel();
    expect(await replyText('file list a.md', 'notdir')).toBe('notdir');
  });

  it('maps a relative path and never reads the local temporary directory', async () => {
    writeFileSync(path.join(root, 'local-only.md'), 'x');
    expect(await replyText('file list local-only.md', 'notdir')).toBe('notdir');
    expect(remote.requests()[0]).toMatchObject({ operation: 'list-directory', args: { path: 'local-only.md' } });
  });

  it('returns the far-side refusal wording for a secret path', async () => {
    expect(await replyText('file list .env', 'forbidden')).toBe('forbidden');
  });

  it('answers an absolute path locally without a request', async () => {
    expect(await start('file list /etc')).toBe('Outside the workspace: /etc.');
    expect(remote.requests()).toEqual([]);
  });

  it('maps a far-side containment refusal to the path as typed', async () => {
    const pending = start('file list ../x');
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    expect(remote.requests()[0]).toMatchObject({ args: { path: '../x' } });
    remote.reply(undefined, OUTSIDE_ROOT_REASON);
    expect(await pending).toBe('Outside the workspace: ../x.');
  });

  it('prints the unavailable line without a channel', async () => {
    expect(await start('file list .', false)).toBe('Remote connection unavailable.');
    expect(remote.attachNavigator).not.toHaveBeenCalled();
  });
});
