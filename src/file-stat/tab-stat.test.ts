import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import { fakeChannel } from '../testing/fake-remote-channel.js';
import { FILE_STAT_USAGE } from './command.js';
import { statFileInTab } from './tab-stat.js';

const STAMP = Date.parse('2026-11-19T13:50:00Z') / 1000;

let root: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-file-stat-'));
  outside = mkdtempSync(path.join(tmpdir(), 'janus-file-stat-out-'));
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
  const target = path.join(root, relative);
  mkdirSync(target, { recursive: true });
  chmodSync(target, 0o755);
  utimesSync(target, STAMP, STAMP);
}

const managersWith = (workspaceDir?: string) => ({
  tab: {
    launchDir: root,
    byLabel: () => ({ label: 'janus', ...(workspaceDir !== undefined && { workspaceDir }) }),
  },
}) as never;

describe('statFileInTab', () => {
  it('prints one row for a file', async () => {
    makeFile('a.md');
    expect(await statFileInTab(managersWith(), 'janus', 'file stat a.md'))
      .toBe('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z a.md');
  });

  it('prints one row for a directory', async () => {
    makeDir('sub');
    const row = await statFileInTab(managersWith(), 'janus', 'file stat sub');
    expect(row.startsWith('dir drwxr-xr-x ')).toBe(true);
    expect(row.endsWith(' 2026-11-19T13:50:00.000Z sub')).toBe(true);
  });

  it('prints missing for an absent path or a vanished stat row', async () => {
    expect(await statFileInTab(managersWith(), 'janus', 'file stat absent')).toBe('missing');
    const port = { statRows: () => ({ 'a.md': null }) } as unknown as FileSystemPort;
    expect(await statFileInTab(managersWith(), 'janus', 'file stat a.md', port)).toBe('missing');
  });

  it('prints forbidden for out-of-workspace and secret paths', async () => {
    expect(await statFileInTab(managersWith(), 'janus', 'file stat ..')).toBe('forbidden');
    expect(await statFileInTab(managersWith(), 'janus', `file stat ${outside}`)).toBe('forbidden');
    expect(await statFileInTab(managersWith(), 'janus', 'file stat .env')).toBe('forbidden');
  });

  it('returns the usage line for malformed arguments', async () => {
    expect(await statFileInTab(managersWith(), 'janus', 'file stat')).toBe(FILE_STAT_USAGE);
    expect(await statFileInTab(managersWith(), 'janus', 'file stat a b')).toBe(FILE_STAT_USAGE);
  });

  it('resolves against the tab workspace or the launch directory', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'janus-file-stat-ws-'));
    try {
      makeFileIn(workspace, 'ws.md');
      const withWorkspace = ({
        tab: { launchDir: root, byLabel: () => ({ label: 'janus', workspaceDir: workspace }) },
      }) as never;
      expect(await statFileInTab(withWorkspace, 'janus', 'file stat ws.md'))
        .toBe('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z ws.md');
      expect(await statFileInTab(managersWith(), 'janus', 'file stat ws.md')).toBe('missing');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

function makeFileIn(directory: string, name: string): void {
  const target = path.join(directory, name);
  writeFileSync(target, 'x');
  chmodSync(target, 0o644);
  utimesSync(target, STAMP, STAMP);
}

describe('statFileInTab on a remote tab', () => {
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

  const start = (line: string, hasChannel = true) => statFileInTab(managers(hasChannel), 'far', line);
  const replyText = async (line: string, text: string) => {
    const pending = start(line);
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    remote.reply({ text });
    return pending;
  };

  it('returns the far-side stat row verbatim on its own session', async () => {
    makeFile('a.md');
    const local = await statFileInTab(managersWith(), 'janus', 'file stat a.md');
    expect(await replyText('file stat a.md', local)).toBe(local);
    const [request] = remote.requests();
    expect(request).toMatchObject({ operation: 'stat-path', args: { path: 'a.md' } });
    expect(request?.session.startsWith('file-stat-')).toBe(true);
    expect(request?.session).not.toBe('far');
  });

  it('returns the far-side missing and refusal wording', async () => {
    expect(await replyText('file stat absent', 'missing')).toBe('missing');
    remote = fakeChannel();
    expect(await replyText('file stat .env', 'forbidden')).toBe('forbidden');
  });

  it('maps a relative path and never reads the local temporary directory', async () => {
    makeFile('local-only.md');
    expect(await replyText('file stat ./local-only.md', 'missing')).toBe('missing');
    expect(remote.requests()[0]).toMatchObject({ operation: 'stat-path', args: { path: 'local-only.md' } });
  });

  it('answers an absolute path locally without a request', async () => {
    expect(await start('file stat /etc/passwd')).toBe('Outside the workspace: /etc/passwd.');
    expect(remote.requests()).toEqual([]);
  });

  it('maps a far-side containment refusal to the path as typed', async () => {
    const pending = start('file stat ../x');
    await vi.waitFor(() => expect(remote.requests()).toHaveLength(1));
    expect(remote.requests()[0]).toMatchObject({ args: { path: '../x' } });
    remote.reply(undefined, OUTSIDE_ROOT_REASON);
    expect(await pending).toBe('Outside the workspace: ../x.');
  });

  it('prints the unavailable line without a channel', async () => {
    expect(await start('file stat a.md', false)).toBe('Remote connection unavailable.');
    expect(remote.attachNavigator).not.toHaveBeenCalled();
  });
});
