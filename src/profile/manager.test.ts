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
import { setWindowBoundsReader } from '../window-resizer.js';
import { messageBus } from '../bus.js';
import { resolveTreeSelections } from '../file-navigator/selection-request.js';

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
    monitor: { snapshot: vi.fn(() => []) },
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
    setWindowBoundsReader(undefined);
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

  it('reports a rejected profile save in the issuing transcript', async () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    setWindowBoundsReader(async () => { throw new Error('window unavailable'); });

    new ProfileManager(managers).run('profile save demo', 'janus');

    await vi.waitFor(() => expect(appended).toHaveLength(1));
    expect(appended).toEqual([{
      input: 'profile save demo',
      output: 'Profile command failed: window unavailable.',
    }]);
  });

  it('reports a rejected profile launch in the issuing transcript', async () => {
    writeProfile('editor-only', JSON.stringify({ tabs: [{ type: 'editor', path: '$root/notes.md' }] }));
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    vi.mocked(managers.openFile.edit).mockImplementation(() => { throw new Error('editor unavailable'); });

    new ProfileManager(managers).run('profile launch editor-only', 'janus');

    await vi.waitFor(() => expect(appended).toHaveLength(1));
    expect(appended).toEqual([{
      input: 'profile launch editor-only',
      output: 'Profile command failed: editor unavailable.',
    }]);
  });

  it('serializes overlapping saves so their selection requests do not cancel each other', async () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);
    const ids: number[] = [];
    const subscription = messageBus.on('fileNavigator', 'collect', (event) => { ids.push(event.id); });

    manager.run('profile save first', 'janus');
    manager.run('profile save second', 'janus');

    await vi.waitFor(() => expect(ids).toHaveLength(1));
    resolveTreeSelections(ids[0]!, []);
    await vi.waitFor(() => expect(ids).toHaveLength(2));
    resolveTreeSelections(ids[1]!, []);
    await vi.waitFor(() => expect(appended).toHaveLength(2));
    subscription.unsubscribe();

    expect(ids[0]).not.toBe(ids[1]);
    expect(appended.map((entry) => entry.input)).toEqual(['profile save first', 'profile save second']);
    expect(appended.every((entry) => entry.output.startsWith('Saved profile'))).toBe(true);
  });

  it('continues the save queue after a rejected save', async () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);
    let boundsReads = 0;
    setWindowBoundsReader(async () => {
      boundsReads += 1;
      if (boundsReads === 1) throw new Error('window unavailable');
      return { width: 1200, height: 800 };
    });
    const subscription = messageBus.on('fileNavigator', 'collect', (event) => {
      resolveTreeSelections(event.id, []);
    });

    manager.run('profile save first', 'janus');
    manager.run('profile save second', 'janus');

    await vi.waitFor(() => expect(appended).toHaveLength(2));
    subscription.unsubscribe();
    expect(appended[0].output).toBe('Profile command failed: window unavailable.');
    expect(appended[1].output).toContain('Saved profile "second"');
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
      workspace: { create: vi.fn(), retain: vi.fn() },
      remote: {
        attach: vi.fn(() => true),
        workspaceOf: vi.fn(() => '/remote/ws'),
        readyOf: vi.fn(() => Promise.resolve('/remote/ws')),
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

  it('does not create a workspace when the creator tab is not workspaced', () => {
    const source = makeTab('claude', 'red');
    const managers = makeAtManagers([source], { claude: '/work' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
  });

  it('shares the creator workspace without cloning when the creator tab is workspaced', () => {
    const source = makeTab('claude', 'red', 1, [], [], '/janus-workspaces/claude');
    const managers = makeAtManagers([source], { claude: '/janus-workspaces/claude' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.workspace.create).not.toHaveBeenCalled();
    expect(managers.workspace.retain).toHaveBeenCalledWith('/janus-workspaces/claude');
    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceDir: '/janus-workspaces/claude' }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith(expect.any(String), '/janus-workspaces/claude');
    expect(managers.tab.addBusy).not.toHaveBeenCalled();
  });

  it('joins a remote creator\'s existing channel and workspace', () => {
    const source = makeTab('claude', 'red');
    source.remote = { host: 'devbox', address: 'devbox:/srv/project' };
    const managers = makeAtManagers([source], { claude: '/remote/ws' });

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.remote.attach).toHaveBeenCalledWith(expect.any(String), 'claude');
    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ remote: source.remote, workspaceDir: undefined }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith(expect.any(String), '/remote/ws');
    expect(managers.workspace.create).not.toHaveBeenCalled();
  });

  it('keeps a joined remote agent busy until the creator workspace is ready', async () => {
    const source = makeTab('claude', 'red');
    source.remote = { host: 'devbox', address: 'devbox:/srv/project' };
    const managers = makeAtManagers([source], { claude: '/remote/project' });
    const { promise, resolve } = Promise.withResolvers<string>();
    vi.mocked(managers.remote.workspaceOf).mockReturnValue(undefined);
    vi.mocked(managers.remote.readyOf).mockReturnValue(promise);

    new ProfileManager(managers).newAgentAt('claude');

    expect(managers.tab.addBusy).toHaveBeenCalledWith(expect.any(String));
    resolve('/remote/ws');
    await promise;
    await new Promise((done) => setTimeout(done, 0));
    expect(managers.tab.setCwd).toHaveBeenLastCalledWith(expect.any(String), '/remote/ws');
    expect(managers.tab.deleteBusy).toHaveBeenCalledWith(expect.any(String));
  });

});
