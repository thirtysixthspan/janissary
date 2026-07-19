import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), sandboxNotice: vi.fn(() => undefined as string | undefined) }));
vi.mock('../notifications.js', () => ({ notify: mocks.notify }));
vi.mock('../sandbox/index.js', () => ({ sandboxNotice: mocks.sandboxNotice }));

import { ProfileManager } from './manager.js';
import { initProfileDir } from '../profiles.js';
import { makeTab } from '../tab/index.js';
import { agentNames } from '../agent-names.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../types.js';

function makeManagers(creator: Tab, tabs: Tab[] = [creator]): { managers: Managers; appended: { input: string; output: string }[] } {
  const appended: { input: string; output: string }[] = [];
  const managers = {
    tab: {
      tabs,
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      allLabels: () => tabs.map((t) => t.label),
      cur: () => creator,
      insertTabInGroup: vi.fn((tab: Tab) => { tabs.push(tab); }),
      setCwd: vi.fn(),
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      setActiveTab: vi.fn(),
      findIndex: vi.fn(() => tabs.length - 1),
      closeTab: vi.fn((index: number) => { tabs.splice(index, 1); }),
      persist: vi.fn(),
      buildAgentState: vi.fn(() => ({ name: creator.label, dotColor: creator.dotColor, active: true })),
      shorten: (p: string) => p,
    },
    workspace: { create: vi.fn() },
  } as unknown as Managers;
  return { managers, appended };
}

describe('ProfileManager.run', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profmgr-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('reports an unknown profile name', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile launch ghost', 'janus');

    expect(appended).toEqual([{ input: 'profile launch ghost', output: 'No profile named "ghost".' }]);
  });

  it('reports an existing profile that has no agent files', () => {
    // Create the profile directory itself so profileExists() is true but loadProfileEntries() is empty.
    mkdirSync(path.join(root, 'profiles', 'empty'), { recursive: true });

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile launch empty', 'janus');

    expect(appended).toEqual([{ input: 'profile launch empty', output: 'Profile "empty" has no agents.' }]);
  });
});

describe('ProfileManager.newAgent', () => {
  it('creates a plain (non-workspace) agent tab and reports it ready immediately', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob');

    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
    expect(appended).toEqual([{ input: 'agent bob', output: 'Agent "bob" ready.' }]);
  });

  it('reports a workspace-creation error and never creates the tab', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    vi.mocked(managers.workspace.create).mockReturnValue({ error: 'Failed to create workspace: not a git repo' });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');

    expect(appended).toEqual([{ input: 'agent bob --workspace', output: 'Failed to create workspace: not a git repo' }]);
    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
  });

  it('creates the tab in the returned workspace dir immediately, marked busy, before the clone resolves', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob', ready: promise });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');

    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'bob', workspaceDir: '/tmp/janus-workspaces/bob' }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith('bob', '/tmp/janus-workspaces/bob');
    expect(managers.tab.addBusy).toHaveBeenCalledWith('bob');
    // Not yet reported ready — the clone hasn't resolved.
    expect(appended).toEqual([]);
    resolve();
  });

  it('clears busy and reports ready with the workspace path only once the clone resolves', async () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob', ready: promise });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');
    resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(managers.tab.deleteBusy).toHaveBeenCalledWith('bob');
    expect(appended).toEqual([
      { input: 'agent bob --workspace', output: 'Agent "bob" ready. (workspace: /tmp/janus-workspaces/bob)' },
    ]);
  });

  it('appends the sandbox notice after the ready message when sandboxing is unavailable', async () => {
    mocks.sandboxNotice.mockReturnValueOnce('workspace isolation off: sandbox-exec unavailable');
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob', ready: promise });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');
    resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(appended).toEqual([
      { input: 'agent bob --workspace', output: 'Agent "bob" ready. (workspace: /tmp/janus-workspaces/bob)' },
      { input: 'agent bob --workspace', output: 'workspace isolation off: sandbox-exec unavailable' },
    ]);
  });

  it('reports the error and closes the tab after a delay when the clone rejects', async () => {
    vi.useFakeTimers();
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const { promise, reject } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob', ready: promise });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');
    reject(new Error('network error'));
    await vi.advanceTimersByTimeAsync(0);

    expect(appended).toEqual([
      { input: 'agent bob --workspace', output: 'Failed to create workspace for "bob": network error' },
    ]);
    expect(managers.tab.closeTab).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(managers.tab.closeTab).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not clear busy or report ready once the tab has been removed before the clone resolves', async () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob', ready: promise });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');
    managers.tab.tabs.length = 1; // simulate the tab having been closed already
    resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(managers.tab.deleteBusy).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });
});

describe('ProfileManager.newAgentAt', () => {
  function makeAtManagers(tabs: Tab[], cwdByLabel: Record<string, string>): Managers {
    return {
      tab: {
        tabs,
        allLabels: () => tabs.map((t) => t.label),
        cwdOf: (label: string) => cwdByLabel[label],
        insertTabInGroup: vi.fn(),
        setCwd: vi.fn(),
        setActiveTab: vi.fn(),
        findIndex: vi.fn(() => 0),
        persist: vi.fn(),
        buildAgentState: vi.fn(() => ({})),
      },
    } as unknown as Managers;
  }

  beforeEach(() => { mocks.notify.mockClear(); });

  it('creates a new agent tab rooted at the source tab cwd and in its group', () => {
    const source = makeTab('claude', 'red', 1, [], [], undefined, 3, 'blue');
    const managers = makeAtManagers([source], { claude: '/work/here' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ group: 3, groupColor: 'blue' }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith(expect.any(String), '/work/here');
  });

  it('does nothing for an unknown label', () => {
    const managers = makeAtManagers([makeTab('claude', 'red')], { claude: '/work' });

    new ProfileManager(managers).newAgentAt('nope');

    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('notifies and creates nothing when every pool name is in use', () => {
    const tabs = agentNames.map((n) => makeTab(n, 'red'));
    const source = tabs[0];
    const managers = makeAtManagers(tabs, { [source.label]: '/work' });

    new ProfileManager(managers).newAgentAt(source.label);

    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'manual', source.label, 'All agent names are in use.');
  });
});
