import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openOrRetarget } from './open.js';
import type { OpenPort } from './open.js';
import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function tree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-navigator-open-'));
  roots.push(root);
  writeFileSync(path.join(root, 'a.ts'), 'a');
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'b.ts'), 'b');
  return root;
}

function makePort(managers: Managers) {
  return {
    managers,
    states: new Map<string, FilesTabState>(),
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    refreshGit: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as OpenPort;
}

// A tab manager that records what it was asked to do and answers the three lookups `openOrRetarget`
// makes: the source tab, its cwd, and the most recent navigator to retarget instead of opening.
function makeManagers(options: {
  source?: { label: string; cwd?: string; remote?: unknown };
  existing?: string;
  attach?: boolean;
} = {}) {
  const source = options.source ?? { label: 'agent', cwd: tree() };
  const sourceTab = { label: source.label, ...(source.remote && { remote: source.remote }) };
  const tabs = [sourceTab];
  const opened: { root: string; waitingFor?: string }[] = [];
  const setCwd = vi.fn();
  const setActiveTab = vi.fn();
  const setDock = vi.fn();
  const ready = Promise.resolve('/remote/ws');
  const attach = vi.fn(() => options.attach ?? true);
  const release = vi.fn();
  // The port a remote navigator is built on attaches itself to the channel in its constructor, so
  // the fake has to be shaped like one rather than a bare marker.
  const channel = { attachNavigator: vi.fn(), detachNavigator: vi.fn(), send: vi.fn() };
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      cwdOf: () => source.cwd,
      mostRecentFileNavigatorLabel: () => options.existing,
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      openFilesTab: (arg: { root: string; waitingFor?: string }) => {
        opened.push({ root: arg.root, waitingFor: arg.waitingFor });
        tabs.push({ label: `files-${tabs.length}`, ...arg });
        return tabs.at(-1);
      },
      cur: () => tabs.at(-1),
      setCwd,
      setActiveTab,
      setDock,
    },
    remote: {
      readyOf: () => ready,
      get: () => channel,
      workspaceOf: () => undefined as string | undefined,
      attach,
      release,
    },
  } as unknown as Managers;
  return { managers, port: makePort(managers), tabs, opened, setCwd, setActiveTab, setDock, attach, release, source };
}

describe('openOrRetarget', () => {
  it('opens a fresh navigator on a local directory, registered and watched', () => {
    const { managers, port, opened, setDock, setCwd } = makeManagers();
    const root = managers.tab.cwdOf?.('agent');

    openOrRetarget(port, 'agent');

    expect(opened).toHaveLength(1);
    expect(opened[0].root).toBe(root);
    const label = port.managers.tab.cur().label;
    expect(port.states.get(label)?.root).toBe(root);
    expect(port.watchDir).toHaveBeenCalledWith(label, root, '');
    expect(port.refreshGit).toHaveBeenCalledWith(label);
    expect(setDock).toHaveBeenCalledWith(expect.any(Number), 'left');
    expect(setCwd).toHaveBeenCalledWith(label, root);
  });

  // A label that names no tab, and a cwd that is not a directory, both mean there is nothing to open
  // — neither is a reason to open an empty navigator at the process's own working directory.
  it('opens nothing for a label that names no tab', () => {
    const { port, opened } = makeManagers();
    openOrRetarget(port, 'gone');
    expect(opened).toEqual([]);
    expect(port.states.size).toBe(0);
  });

  it('opens nothing when the source cwd is not a directory', () => {
    const missing = path.join(tmpdir(), 'janus-navigator-open-absent');
    const { port, opened, setActiveTab } = makeManagers({ source: { label: 'agent', cwd: missing } });
    openOrRetarget(port, 'agent');
    expect(opened).toEqual([]);
    expect(port.states.size).toBe(0);
    expect(setActiveTab).toHaveBeenCalled();
  });

  it('retargets the most recent navigator rather than opening a second one', () => {
    const { managers, port, opened, setCwd, tabs } = makeManagers({ existing: 'files-1' });
    const target = managers.tab.cwdOf('agent');
    tabs.push({ label: 'files-1' });
    port.states.set('files-1', {
      root: '/old', expanded: new Set(), watchers: new Map(), listings: new Map(),
      listingLoads: new Set(), statLoads: new Set(), cacheGeneration: 0, undoStack: [], redoStack: [],
      details: 'name', stats: new Map(), filesystem: { dispose: vi.fn() },
    } as unknown as FilesTabState);

    openOrRetarget(port, 'agent');

    expect(opened).toEqual([]);
    expect(port.states.get('files-1')?.root).toBe(target);
    expect(port.unwatchDir).toHaveBeenCalled();
    expect(setCwd).toHaveBeenCalledWith('files-1', target);
  });

  // A remote source with no channel yet has no workspace to show, and opening a navigator against it
  // would be a tab stuck on "waiting" with nothing that will ever answer.
  it('opens nothing for a remote source whose channel is not ready', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, opened, attach } = makeManagers({ source: { label: 'agent', remote } });
    port.managers.remote.readyOf = vi.fn(() => undefined as unknown as Promise<string>);
    openOrRetarget(port, 'agent');
    expect(opened).toEqual([]);
    expect(attach).not.toHaveBeenCalled();
  });

  // With no workspace named yet, the tab waits on a real path and re-roots once the handshake
  // answers — the source tab carries no cwd here, so the wait falls back to the process's own.
  it('opens a waiting navigator for a remote source, attached and owned', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, opened, attach } = makeManagers({ source: { label: 'agent', remote } });

    openOrRetarget(port, 'agent');

    expect(attach).toHaveBeenCalledWith(port.managers.tab.cur().label, 'agent');
    const label = port.managers.tab.cur().label;
    const state = port.states.get(label);
    expect(opened[0].waitingFor).toBe(process.cwd());
    expect(state?.ownerLabel).toBe('agent');
    expect(state?.remote).toBe(remote);
  });

  // The workspace resolves after the handshake, and it is the first `provision` or `attach` that
  // settles it — so a navigator opened before then has to re-root itself onto the answer.
  it('re-roots onto the workspace once the handshake settles', async () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { promise, resolve } = Promise.withResolvers<string>();
    const { port, setCwd } = makeManagers({ source: { label: 'agent', remote } });
    port.managers.remote.readyOf = () => promise;

    openOrRetarget(port, 'agent');
    const label = port.managers.tab.cur().label;
    expect(port.states.get(label)?.root).not.toBe('/remote/ws');

    resolve('/remote/ws/clone');
    await promise;
    await Promise.resolve();

    const state = port.states.get(label);
    expect(state?.root).toBe('/remote/ws/clone');
    expect(state?.remoteRoot).toBe('/remote/ws/clone');
    expect(port.watchDir).toHaveBeenLastCalledWith(label, '/remote/ws/clone', '');
    expect(setCwd).toHaveBeenLastCalledWith(label, '/remote/ws/clone');
    expect(port.rebuild).toHaveBeenCalledWith(label);
  });

  // An attach that fails leaves the opened tab with nothing behind it, so it is not registered: a
  // navigator state with no channel would sit there "waiting" forever.
  it('opens no state for a remote tab the attach refused', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, opened } = makeManagers({ source: { label: 'agent', remote }, attach: false });
    openOrRetarget(port, 'agent');
    expect(opened).toHaveLength(1);
    expect(port.states.size).toBe(0);
  });

  // Retargeting a navigator that already belongs to this very source is a no-op: doing the work
  // again would tear down a live channel and re-establish it for no reason.
  it('leaves an already-owned navigator alone', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, attach } = makeManagers({ source: { label: 'agent', remote }, existing: 'files-1' });
    port.states.set('files-1', { ownerLabel: 'agent' } as unknown as FilesTabState);

    openOrRetarget(port, 'agent');

    expect(attach).not.toHaveBeenCalled();
    expect(port.unwatchDir).not.toHaveBeenCalled();
  });

  it('releases the old owner and attaches the new one when retargeting a remote navigator', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, attach, release } = makeManagers({ source: { label: 'agent', remote }, existing: 'files-1' });
    port.states.set('files-1', {
      root: '/old', ownerLabel: 'other', expanded: new Set(), watchers: new Map(), listings: new Map(),
      listingLoads: new Set(), statLoads: new Set(), cacheGeneration: 0, undoStack: [], redoStack: [],
      details: 'name', stats: new Map(), remote: { host: 'other', address: 'other' },
      filesystem: { dispose: vi.fn() },
    } as unknown as FilesTabState);

    openOrRetarget(port, 'agent');

    expect(release).toHaveBeenCalledWith('files-1');
    expect(attach).toHaveBeenCalledWith('files-1', 'agent');
    expect(port.states.get('files-1')?.ownerLabel).toBe('agent');
  });

  // The old owner has already been released by this point, so an attach that fails here leaves the
  // navigator with no channel at all. Returning rather than retargeting keeps the existing state
  // intact for the source it still belongs to.
  it('keeps the existing state when retargeting it to a source the attach refused', () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { port, attach } = makeManagers({ source: { label: 'agent', remote }, existing: 'files-1', attach: false });
    port.states.set('files-1', {
      root: '/kept', ownerLabel: 'other', expanded: new Set(), watchers: new Map(), listings: new Map(),
      listingLoads: new Set(), statLoads: new Set(), cacheGeneration: 0, undoStack: [], redoStack: [],
      details: 'name', stats: new Map(), remote: { host: 'other', address: 'other' },
      filesystem: { dispose: vi.fn() },
    } as unknown as FilesTabState);

    openOrRetarget(port, 'agent');

    expect(attach).toHaveBeenCalledWith('files-1', 'agent');
    expect(port.states.get('files-1')?.root).toBe('/kept');
    expect(port.unwatchDir).not.toHaveBeenCalled();
  });

  // A label the manager still offers as "most recent" can have no state left — a navigator closed
  // between the two lookups. There is nothing to retarget, so nothing is touched.
  it('retargets nothing for a most-recent label that has no state', () => {
    const { port, opened, setCwd } = makeManagers({ existing: 'files-1' });
    openOrRetarget(port, 'agent');
    expect(opened).toEqual([]);
    expect(port.states.size).toBe(0);
    expect(port.watchDir).not.toHaveBeenCalled();
    expect(setCwd).not.toHaveBeenCalled();
  });

  // The handshake can land after the navigator closed. There is then nothing to re-root, and
  // re-pointing a fresh tab that has since taken the label would be worse than doing nothing.
  it('re-roots nothing when the handshake settles after the navigator closed', async () => {
    const remote = { host: 'devbox', address: 'devbox' };
    const { promise, resolve } = Promise.withResolvers<string>();
    const { port } = makeManagers({ source: { label: 'agent', remote } });
    port.managers.remote.readyOf = () => promise;

    openOrRetarget(port, 'agent');
    const label = port.managers.tab.cur().label;
    port.states.delete(label);

    resolve('/remote/ws/clone');
    await promise;
    await Promise.resolve();

    expect(port.states.size).toBe(0);
    expect(port.watchDir).toHaveBeenCalledOnce();
  });
});
