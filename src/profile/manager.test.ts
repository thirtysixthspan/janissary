import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), sandboxNotice: vi.fn(() => undefined as string | undefined) }));
vi.mock('../notifications.js', () => ({ notify: mocks.notify }));
vi.mock('../sandbox/index.js', () => ({ sandboxNotice: mocks.sandboxNotice }));

import { ProfileManager } from './manager.js';
import { initProfileDir } from '../profiles.js';
import { makeTab } from '../tab/index.js';
import { agentNames } from '../agent/names.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

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
      cwdOf: () => '/proj',
      launchDir: '/proj',
      activeTab: 0,
      placeProfileTabs: vi.fn(),
    },
    workspace: { create: vi.fn() },
    openFile: { edit: vi.fn() },
  } as unknown as Managers;
  return { managers, appended };
}

describe('ProfileManager.run', () => {
  let root: string;

  const writeProfile = (name: string, contents: string) => {
    writeFileSync(path.join(root, 'profiles', `${name}.json`), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profmgr-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
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

  it('reports an existing profile that has no tabs', () => {
    writeProfile('empty', JSON.stringify({}));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile launch empty', 'janus');

    expect(appended).toEqual([{ input: 'profile launch empty', output: 'Profile "empty" has no tabs.' }]);
  });

  it('reports an empty tabs array as having no tabs', () => {
    writeProfile('none', JSON.stringify({ tabs: [] }));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    new ProfileManager(managers).run('profile launch none', 'janus');

    expect(appended).toEqual([{ input: 'profile launch none', output: 'Profile "none" has no tabs.' }]);
  });

  // The launch itself is asynchronous — a plugin tab opens through its plugin's activation — so the
  // summary lands a microtask after `run` returns.
  it('launches a profile holding only an editor entry rather than calling it empty', async () => {
    writeProfile('editor-only', JSON.stringify({ tabs: [{ type: 'editor', path: '$root/notes.md' }] }));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    new ProfileManager(managers).run('profile launch editor-only', 'janus');
    await vi.waitFor(() => expect(appended).not.toHaveLength(0));

    expect(appended[0].output).not.toContain('has no tabs.');
  });

  it('reports a malformed profile and opens nothing', () => {
    writeProfile('broken', JSON.stringify({ tabs: [{ type: 'harness', name: 'c' }] }));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile launch broken', 'janus');

    expect(appended[0].output).toContain('Profile "broken" is malformed.');
    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
  });

  it('reports an unrecognized tab type as malformed', () => {
    writeProfile('mystery', JSON.stringify({ tabs: [{ type: 'terminal' }] }));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    new ProfileManager(managers).run('profile launch mystery', 'janus');

    expect(appended[0].output).toContain('Profile "mystery" is malformed.');
    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
  });

  it('routes the validate action to the validator', () => {
    writeProfile('good', JSON.stringify({ tabs: [{ type: 'agent', name: 'bob', active: false }] }));
    writeProfile('bad', JSON.stringify({ tabs: [{ type: 'harness', name: 'c' }] }));

    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile validate good', 'janus');
    manager.run('profile validate bad', 'janus');

    expect(appended[0].output).toBe('Profile "good" is valid.');
    expect(appended[1].output).toContain('Profile "bad" is not valid:');
  });
});

describe('ProfileManager.newAgent', () => {
  it('creates a plain (non-workspace) agent tab and reports it ready immediately', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --no-workspace');

    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
    expect(appended).toEqual([{ input: 'agent bob --no-workspace', output: 'Agent "bob" ready.' }]);
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
        insertTabInGroup: vi.fn((tab: Tab) => { tabs.push(tab); }),
        setCwd: vi.fn(),
        setActiveTab: vi.fn(),
        findIndex: vi.fn(() => tabs.length - 1),
        closeTab: vi.fn((index: number) => { tabs.splice(index, 1); }),
        addBusy: vi.fn(),
        deleteBusy: vi.fn(),
        persist: vi.fn(),
        buildAgentState: vi.fn(() => ({})),
        shorten: (p: string) => p,
      },
      workspace: { create: vi.fn() },
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

  it('does not create a workspace when the creator tab is not workspaced', () => {
    const source = makeTab('claude', 'red');
    const managers = makeAtManagers([source], { claude: '/work' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
  });

  it('creates a workspace for the new agent when the creator tab is workspaced', () => {
    const source = makeTab('claude', 'red', 1, [], [], '/janus-workspaces/claude');
    const managers = makeAtManagers([source], { claude: '/janus-workspaces/claude' });
    const { promise } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/janus-workspaces/bob', ready: promise });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.workspace.create).toHaveBeenCalledWith(expect.any(String));
    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceDir: '/janus-workspaces/bob' }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith(expect.any(String), '/janus-workspaces/bob');
    expect(managers.tab.addBusy).toHaveBeenCalled();
  });

  it('reports the workspace error via notify and creates no tab when cloning fails for a workspaced creator', () => {
    const source = makeTab('claude', 'red', 1, [], [], '/janus-workspaces/claude');
    const managers = makeAtManagers([source], { claude: '/janus-workspaces/claude' });
    vi.mocked(managers.workspace.create).mockReturnValue({ error: 'Failed to create workspace: not a git repo' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'manual', 'claude', 'Failed to create workspace: not a git repo');
  });

  it('clears busy and notifies ready with the workspace path once the clone resolves for a workspaced creator', async () => {
    const source = makeTab('claude', 'red', 1, [], [], '/janus-workspaces/claude');
    const managers = makeAtManagers([source], { claude: '/janus-workspaces/claude' });
    const { promise, resolve } = Promise.withResolvers<void>();
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/janus-workspaces/bob', ready: promise });

    new ProfileManager(managers).newAgentAt('claude');
    resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(managers.tab.deleteBusy).toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'manual', 'claude', expect.stringContaining('workspace: /janus-workspaces/bob'),
    );
  });
});
