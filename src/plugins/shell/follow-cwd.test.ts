import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../../managers.js';
import type { Tab } from '../../tab/types.js';
import { TabManager } from '../../tab/manager.js';
import { openOrRetarget, type OpenPort } from '../../file-navigator/open.js';
import { createPluginContext } from '../context.js';
import { activate } from './activate.js';
import { shellManifest } from './manifest.js';
import type { ShellPayload } from './shared.js';

// The shell tab's metadata-row actions read the directory the host has recorded for the tab. These
// cases run zsh's cwd report through the real capability and the real tab manager, then ask the
// file navigator where it would open, so the whole chain from `cd` to the navigator is pinned.
let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function directory(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-shell-cwd-'));
  roots.push(root);
  return root;
}

function shellTab(start: string): { managers: Managers; payload: ShellPayload } {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers, start);
  const payload: ShellPayload = {
    instanceKey: 'shell-1', ptyId: 'pty1', cwd: start, root: start, workspace: false, cols: 80, rows: 24,
    connections: [], schedule: [],
  };
  managers.tab.tabs.push({
    label: 'shell1', dotColor: '#fff', log: [], view: 'plugin',
    plugin: { id: 'shell', instanceKey: 'shell-1', schemaVersion: 2, payload, fileRefs: [], sourceLabel: 'janus' },
  } as unknown as Tab);
  managers.tab.setCwd('shell1', start);
  return { managers, payload };
}

function reportCwd(managers: Managers, payload: ShellPayload, cwd: string) {
  const capabilities = createPluginContext(
    managers, shellManifest, activate(), { label: 'janus', command: 'zsh' }, () => true, [], 'shell1',
  );
  return activate().intent({ tab: 'shell1', intent: 'cwd', payload: cwd, tabPayload: payload }, capabilities);
}

describe('a shell tab following zsh\'s directory', () => {
  it('opens the file navigator from its metadata row in the directory zsh changed to', () => {
    const start = directory();
    const moved = directory();
    const { managers, payload } = shellTab(start);
    const openFilesTab = vi.spyOn(managers.tab, 'openFilesTab').mockImplementation(() => {});
    vi.spyOn(managers.tab, 'mostRecentFileNavigatorLabel').mockReturnValue(undefined);

    reportCwd(managers, payload, moved);
    const port = {
      managers, states: new Map(), watchDir: vi.fn(), unwatchDir: vi.fn(), refreshGit: vi.fn(), rebuild: vi.fn(),
    } as unknown as OpenPort;
    openOrRetarget(port, 'shell1');

    expect(managers.tab.cwdOf('shell1')).toBe(moved);
    expect(openFilesTab).toHaveBeenCalledWith(expect.objectContaining({ root: moved }));
  });
});
