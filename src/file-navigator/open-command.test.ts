import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openFilesCommand } from './open-command.js';
import type { FilesTabState } from './state.js';
import type { Managers } from '../managers.js';
import type { RemoteTarget, Tab } from '../tab/types.js';

const REMOTE: RemoteTarget = { host: 'devbox', address: 'devbox:/srv/project' };

type Harness = {
  managers: Managers;
  tabs: Map<string, FilesTabState>;
  opened: Tab[];
  docks: { index: number; dock: 'left' | 'right' | null }[];
  cwds: { label: string; cwd: string }[];
  watchDir: ReturnType<typeof vi.fn>;
  refreshGit: ReturnType<typeof vi.fn>;
  pollForCreation: ReturnType<typeof vi.fn>;
  rebuild: ReturnType<typeof vi.fn>;
  remote: {
    get: ReturnType<typeof vi.fn>;
    readyOf: ReturnType<typeof vi.fn>;
    workspaceOf: ReturnType<typeof vi.fn>;
    homeOf: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
  };
};

let root: string;
let ready: PromiseWithResolvers<string>;
let sourceTab: Tab;

function channel() {
  return { attachNavigator: vi.fn(), detachNavigator: vi.fn(), send: vi.fn() };
}

function harness(options: { channel?: unknown; attach?: boolean; existing?: Tab; cwd?: string; view?: string; workspace?: string } = {}): Harness {
  const opened: Tab[] = [];
  const docks: { index: number; dock: 'left' | 'right' | null }[] = [];
  const cwds: { label: string; cwd: string }[] = [];
  const tabs = new Map<string, FilesTabState>();
  ready = Promise.withResolvers<string>();
  sourceTab = { label: 'other', remote: REMOTE, view: options.view ?? 'agent' } as unknown as Tab;
  const allTabs: Tab[] = options.existing ? [sourceTab, options.existing] : [sourceTab];

  const remote = {
    get: vi.fn(() => ('channel' in options ? options.channel : channel())),
    readyOf: vi.fn(() => ready.promise),
    workspaceOf: vi.fn(() => options.workspace ?? '/remote/ws'),
    homeOf: vi.fn(() => '/home/remote'),
    attach: vi.fn(() => options.attach ?? true),
  };
  const managers = {
    tab: {
      tabs: allTabs,
      launchDir: root,
      cwdOf: (label: string) => (label === 'other' ? options.cwd ?? '/remote/ws' : root),
      byLabel: (label: string) => allTabs.find((tab) => tab.label === label),
      cur: () => opened.at(-1)!,
      append: vi.fn(),
      setCwd: (label: string, cwd: string) => { cwds.push({ label, cwd }); },
      setDock: (index: number, dock: 'left' | 'right' | null) => { docks.push({ index, dock }); },
      findIndex: (label: string) => allTabs.findIndex((tab) => tab.label === label),
      openFilesTab: (view: unknown) => {
        const tab = { label: `navigator${opened.length + 1}`, files: view } as unknown as Tab;
        opened.push(tab);
        allTabs.push(tab);
      },
      filesTabByRoot: vi.fn(),
    },
    remote,
  } as unknown as Managers;

  return {
    managers,
    tabs,
    opened,
    docks,
    cwds,
    watchDir: vi.fn(),
    refreshGit: vi.fn(),
    pollForCreation: vi.fn(),
    rebuild: vi.fn(),
    remote,
  };
}

function run(h: Harness, command: string, label = 'janus'): string | undefined {
  return openFilesCommand(h.managers, h.tabs, command, label, h.watchDir, h.refreshGit, h.pollForCreation, h.rebuild);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'open-command-')));
  mkdirSync(path.join(root, 'sub'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('openFilesCommand over a remote label', () => {
  it.each(['agent', 'harness'])('uses the remote cwd for bare files from a remote %s tab', (view) => {
    const h = harness({ view, cwd: '/remote/ws/src' });

    expect(run(h, 'files', 'other')).toBe('navigator1');
    expect(h.opened[0].files?.root).toBe('/remote/ws/src');
    expect(h.opened[0].files?.remote).toEqual(REMOTE);
  });

  it('refuses to open while the remote workspace is provisioning', () => {
    const h = harness({ workspace: undefined });
    h.remote.workspaceOf.mockReturnValue(undefined);

    expect(run(h, 'files', 'other')).toBeUndefined();
    expect(h.opened).toEqual([]);
    expect(h.managers.tab.append).toHaveBeenCalledWith('other', expect.objectContaining({
      output: 'The remote workspace is not ready yet.',
    }));
  });

  it.each(['files ../../outside', 'files in other ../../outside'])('refuses an outside path from %s', (command) => {
    const h = harness();

    expect(run(h, command, command.includes(' in ') ? 'janus' : 'other')).toBeUndefined();
    expect(h.opened).toEqual([]);
    expect(h.managers.tab.append).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      output: '"/outside" is outside the remote workspace /remote/ws.',
    }));
  });

  it('opens nothing when the label has no channel to ask', () => {
    const h = harness({ channel: undefined });

    expect(run(h, 'files in other')).toBeUndefined();
    expect(h.opened).toEqual([]);
    expect(h.tabs.size).toBe(0);
  });

  it('registers no tree when the navigator cannot attach to the source channel', () => {
    const h = harness({ attach: false });

    expect(run(h, 'files in other')).toBeUndefined();
    expect(h.opened).toHaveLength(1);
    expect(h.tabs.size).toBe(0);
  });

  it('docks the new tree where the command asked', () => {
    const h = harness();

    const label = run(h, 'files in other on left');

    expect(label).toBe('navigator1');
    expect(h.docks).toEqual([{ index: 1, dock: 'left' }]);
  });

  it('focuses a tree already open on the same remote root instead of opening a second', () => {
    const existing = { label: 'navigator9', files: { root: '/remote/ws', remote: REMOTE } } as unknown as Tab;
    const h = harness({ existing });
    h.tabs.set('navigator9', { root: '/remote/ws', details: 'name' } as unknown as FilesTabState);

    const label = run(h, 'files in other with size');

    expect(label).toBe('navigator9');
    expect(h.opened).toEqual([]);
    expect(h.docks).toEqual([{ index: 1, dock: null }]);
    expect(h.tabs.get('navigator9')?.details).toBe('size');
    expect(h.rebuild).toHaveBeenCalledWith('navigator9');
  });

  it('re-roots the tree onto the workspace once it resolves to a different directory', async () => {
    const h = harness();
    const stop = vi.fn();
    const label = run(h, 'files in other sub')!;
    h.tabs.get(label)!.watchers.set('sub', { stop });
    h.watchDir.mockClear();

    ready.resolve('/remote/elsewhere');

    await vi.waitFor(() => expect(h.cwds.at(-1)).toEqual({ label, cwd: '/remote/elsewhere/sub' }));
    expect(h.tabs.get(label)!.root).toBe('/remote/elsewhere/sub');
    expect(stop).toHaveBeenCalledOnce();
    expect(h.tabs.get(label)!.watchers.size).toBe(0);
    expect(h.watchDir).toHaveBeenCalledWith(label, '/remote/elsewhere/sub', '');
    expect(h.rebuild).toHaveBeenCalledWith(label);
  });

  it('keeps a tree whose root already matches the workspace, and rebuilds it', async () => {
    const h = harness();
    const label = run(h, 'files in other')!;
    h.watchDir.mockClear();

    ready.resolve('/remote/ws');

    await vi.waitFor(() => expect(h.rebuild).toHaveBeenCalledWith(label));
    expect(h.tabs.get(label)!.root).toBe('/remote/ws');
    expect(h.cwds).toEqual([{ label, cwd: '/remote/ws' }]);
    expect(h.watchDir).not.toHaveBeenCalled();
  });

  it('leaves a tree alone once another command has replaced its state', async () => {
    const h = harness();
    const label = run(h, 'files in other')!;
    const replacement = { ...h.tabs.get(label)!, root: '/somewhere/else' } as FilesTabState;
    h.tabs.set(label, replacement);

    ready.resolve('/remote/elsewhere');

    await vi.waitFor(() => expect(h.rebuild).not.toHaveBeenCalled());
    expect(h.tabs.get(label)).toBe(replacement);
    expect(replacement.root).toBe('/somewhere/else');
  });
});

describe('openFilesCommand docking a tree that is waiting to be created', () => {
  it('docks the waiting tab where the command asked', () => {
    const h = harness();

    const label = run(h, 'files on right not-yet-there');

    expect(label).toBe('navigator1');
    expect(h.docks).toEqual([{ index: 1, dock: 'right' }]);
    expect(h.pollForCreation).toHaveBeenCalledWith('navigator1', path.join(root, 'not-yet-there'));
  });
});
