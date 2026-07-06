import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileManager } from './profile-manager.js';
import { initProfileDir } from './profiles.js';
import { makeTab } from './tab.js';
import type { Managers } from './managers.js';
import type { Tab } from './types.js';

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
