import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileSystemPort } from '../file-navigator/filesystem-port.js';
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
