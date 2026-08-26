import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRemoteAgent } from './remote-agent.js';
import { openAgentEntry } from './entry-openers.js';
import { newAgentOp } from './new-agent.js';
import { parseRemoteAddress, type RemoteAddress } from '../remote/address.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

type RemoteHandlers = {
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

function address(token: string): RemoteAddress {
  const parsed = parseRemoteAddress(token);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
}

function makeManagers(): {
  managers: Managers; tabs: Tab[]; out: ReturnType<typeof vi.fn>;
  openChannel: ReturnType<typeof vi.fn>; createWorkspace: ReturnType<typeof vi.fn>;
  ready: (dir: string, notice?: string) => void; fail: (message: string) => void; drop: () => void;
} {
  const tabs: Tab[] = [{ label: 'janus', group: 1, groupColor: '#fff', dotColor: '#fff', log: [] } as unknown as Tab];
  const busy = new Set<string>();
  let handlers: RemoteHandlers | undefined;
  const out = vi.fn();
  const openChannel = vi.fn((_label: string, _addr: RemoteAddress, _cwd: string, h: RemoteHandlers) => {
    handlers = h;
    return { ptyId: 'ssh-pty-1', attached: false, send: vi.fn() };
  });
  const createWorkspace = vi.fn();
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      allLabels: () => tabs.map((t) => t.label),
      cwdOf: () => '/proj',
      setCwd: vi.fn(),
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      addBusy: vi.fn((label: string) => { busy.add(label); }),
      deleteBusy: vi.fn((label: string) => { busy.delete(label); }),
      isBusy: (label: string) => busy.has(label),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      setActiveTab: vi.fn(),
      closeTab: vi.fn((index: number) => { tabs.splice(index, 1); }),
      persist: vi.fn(),
      buildAgentState: vi.fn((tab: Tab) => ({ name: tab.label, dotColor: tab.dotColor, active: false })),
      append: vi.fn(),
      launchDir: '/proj',
      shorten: (p: string) => p,
    },
    remote: { open: openChannel },
    workspace: { create: createWorkspace },
    schedule: { set: vi.fn() },
  } as unknown as Managers;
  return {
    managers, tabs, out, openChannel, createWorkspace,
    ready: (dir, notice) => handlers!.onReady(dir, notice),
    fail: (message) => handlers!.onFailed(message),
    drop: () => handlers!.onClosed(),
  };
}

describe('startRemoteAgent', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function launch(harness: ReturnType<typeof makeManagers>, token = 'admin@devbox:/srv/proj') {
    startRemoteAgent(harness.managers, {
      resolved: 'bekir', creator: harness.tabs[0], address: address(token),
      offline: false, cwd: '/proj', out: harness.out,
    });
  }

  it('places a busy agent tab carrying the remote target and no local workspace', () => {
    const h = makeManagers();
    launch(h);

    expect(h.createWorkspace).not.toHaveBeenCalled();
    expect(h.tabs.at(-1)).toMatchObject({
      label: 'bekir',
      remote: { address: 'admin@devbox:/srv/proj', host: 'devbox' },
      workspaceDir: undefined,
    });
    expect(h.managers.tab.isBusy('bekir')).toBe(true);
  });

  // The ssh session takes the tab over full-screen while it authenticates, so ssh's own password,
  // passphrase, and host-key prompts render there and are answered by typing.
  it('shows the live ssh session full-tab, then releases it once the workspace is ready', async () => {
    const h = makeManagers();
    launch(h);
    expect(h.tabs.at(-1)!.activePty).toBe('ssh-pty-1');

    h.ready('/srv/proj/.janissary/workspace/bekir');
    await vi.advanceTimersByTimeAsync(0);

    expect(h.tabs.at(-1)!.activePty).toBeUndefined();
  });

  it('adopts the remote workspace as the tab\'s working directory and clears busy', async () => {
    const h = makeManagers();
    launch(h);

    h.ready('/srv/proj/.janissary/workspace/bekir');
    await vi.advanceTimersByTimeAsync(0);

    expect(h.managers.tab.setCwd).toHaveBeenCalledWith('bekir', '/srv/proj/.janissary/workspace/bekir');
    expect(h.managers.tab.isBusy('bekir')).toBe(false);
    expect(h.out).toHaveBeenCalledWith(expect.stringContaining('ready on devbox'));
  });

  it('reports the remote host\'s own isolation notice', async () => {
    const h = makeManagers();
    launch(h);

    h.ready('/srv/ws', 'workspace isolation off: sandbox-exec unavailable');
    await vi.advanceTimersByTimeAsync(0);

    expect(h.out).toHaveBeenCalledWith('workspace isolation off: sandbox-exec unavailable');
  });

  it('reports a provisioning failure and closes the tab after the fixed delay', async () => {
    const h = makeManagers();
    launch(h);

    h.fail('/srv/proj has no "origin" remote.');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.out).toHaveBeenCalledWith(expect.stringContaining('no "origin" remote'));
    expect(h.managers.tab.closeTab).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(h.managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });

  it('closes the tab when the channel drops before the workspace is ready', async () => {
    const h = makeManagers();
    launch(h);

    h.drop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(h.out).toHaveBeenCalledWith(expect.stringContaining('devbox'));
    expect(h.managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });

  it('closes the tab when the channel drops after the agent is ready', async () => {
    const h = makeManagers();
    launch(h);
    h.ready('/srv/ws');
    await vi.advanceTimersByTimeAsync(0);

    h.drop();

    expect(h.managers.tab.closeTab).toHaveBeenCalledTimes(1);
  });
});

describe('agent on <address> — command and profile entry points', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('opens a remote agent tab from a typed command, never creating a local workspace', () => {
    const h = makeManagers();
    newAgentOp(h.managers, 'agent bekir on devbox');

    expect(h.createWorkspace).not.toHaveBeenCalled();
    expect(h.openChannel).toHaveBeenCalledWith('bekir', expect.objectContaining({ host: 'devbox' }), '/proj', expect.anything());
    expect(h.tabs.at(-1)).toMatchObject({ label: 'bekir', remote: { host: 'devbox' } });
  });

  it('reports an unusable address instead of launching anything', () => {
    const h = makeManagers();
    newAgentOp(h.managers, 'agent bekir on devbox;id');

    expect(h.openChannel).not.toHaveBeenCalled();
    expect(h.createWorkspace).not.toHaveBeenCalled();
    expect(h.managers.tab.append).toHaveBeenCalledWith('janus', expect.objectContaining({
      output: expect.stringContaining('devbox;id'),
    }));
  });

  it('reopens a profile entry\'s remote agent against the same destination', () => {
    const h = makeManagers();
    const error = openAgentEntry(
      { name: 'bekir', dotColor: '#aaa', active: false, remote: 'admin@devbox:/srv/proj' },
      h.managers, 4, '#bbb', '#aaa',
    );

    expect(error).toBeUndefined();
    expect(h.openChannel).toHaveBeenCalledWith('bekir', expect.objectContaining({ destination: 'admin@devbox' }), '/proj', expect.anything());
    expect(h.tabs.at(-1)).toMatchObject({ group: 4, groupColor: '#bbb', dotColor: '#aaa' });
  });

  it('reports and skips a profile entry whose remote address is unusable', () => {
    const h = makeManagers();
    const error = openAgentEntry(
      { name: 'bekir', dotColor: '#aaa', active: false, remote: 'devbox;id' },
      h.managers, 4, '#bbb', '#aaa',
    );

    expect(error).toContain('devbox;id');
    expect(h.openChannel).not.toHaveBeenCalled();
  });
});
