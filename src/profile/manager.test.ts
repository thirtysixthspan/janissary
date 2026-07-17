import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications.js', () => ({ notify: mocks.notify }));

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
      insertTabInGroup: vi.fn(),
      setCwd: vi.fn(),
      setActiveTab: vi.fn(),
      findIndex: vi.fn(() => 0),
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
  it('reports a workspace-creation error and never creates the tab', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    vi.mocked(managers.workspace.create).mockReturnValue({ error: 'Failed to create workspace: not a git repo' });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');

    expect(appended).toEqual([{ input: 'agent bob --workspace', output: 'Failed to create workspace: not a git repo' }]);
    expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
  });

  it('creates the tab in the returned workspace dir on success', () => {
    const janus = makeTab('janus', 'red');
    const { managers } = makeManagers(janus);
    vi.mocked(managers.workspace.create).mockReturnValue({ dir: '/tmp/janus-workspaces/bob' });
    const manager = new ProfileManager(managers);

    manager.newAgent('agent bob --workspace');

    expect(managers.tab.insertTabInGroup).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'bob', workspaceDir: '/tmp/janus-workspaces/bob' }),
    );
    expect(managers.tab.setCwd).toHaveBeenCalledWith('bob', '/tmp/janus-workspaces/bob');
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
