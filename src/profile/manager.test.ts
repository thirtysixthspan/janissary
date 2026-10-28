import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), sandboxNotice: vi.fn(() => undefined as string | undefined) }));
vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../sandbox/index.js', () => ({ sandboxNotice: mocks.sandboxNotice }));

// No workspace folder exists or is held for any label unless a test says so.
const leftover = vi.hoisted(() => ({
  isWorkspaceRunning: vi.fn(() => false),
  hasLeftoverWorkspace: vi.fn(() => false),
  removeLeftoverWorkspace: vi.fn((): string | undefined => undefined),
}));
vi.mock('../launch-name/leftover.js', () => leftover);

import { ProfileManager } from './manager.js';
import { PROFILE_USAGE } from './command.js';
import { initProfileDir } from '../profiles.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import { initWorkspaceDir } from '../workspace/index.js';

// Only sets where workspace paths resolve; nothing under it is ever created.
initWorkspaceDir('/proj');
import type { Tab } from '../tab/types.js';
import { setWindowBoundsReader } from '../window-resizer.js';

function makeManagers(creator: Tab, tabs: Tab[] = [creator]): { managers: Managers; appended: { input: string; output: string }[] } {
  const appended: { input: string; output: string }[] = [];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t: Tab) => t.label === label),
      append: (_label: string, entry: { input: string; output: string }) => { appended.push(entry); },
      appendForInvocation: vi.fn((_label: string, entry: { input: string; output: string }) => { appended.push(entry); }),
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
      cwdOf: () => '/proj', workingDirOf: () => '/proj',
      launchDir: '/proj',
      activeTab: 0,
      placeProfileTabs: vi.fn(),
      enqueueSystemBatch: vi.fn(),
    },
    systemShell: { ensure: vi.fn(async () => ({ status: 'ok' as const, tab: creator })) },
    workspace: { create: vi.fn(), preflight: vi.fn((): string | undefined => undefined) },
    openFile: { edit: vi.fn() },
    monitor: { snapshot: vi.fn(() => []) },
    sessions: { view: vi.fn(() => []) },
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

  // A command the parser cannot read is answered with the usage line on the tab that typed it, and
  // nothing else runs — there is no action to take, so there is nothing to report twice.
  it('answers an unreadable command with the usage line and runs nothing', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile', 'janus');
    manager.run('profile frobnicate', 'janus');

    expect(appended).toEqual([
      { input: 'profile', output: PROFILE_USAGE },
      { input: 'profile frobnicate', output: PROFILE_USAGE },
    ]);
  });

  it('answers a launch or save with no name with that action\'s own usage', () => {
    const janus = makeTab('janus', 'red');
    const { managers, appended } = makeManagers(janus);
    const manager = new ProfileManager(managers);

    manager.run('profile launch', 'janus');

    expect(appended).toEqual([
      { input: 'profile launch', output: 'Usage: profile launch <name>' },
    ]);
  });

  describe('runscript profiles', () => {
    const writeRunscript = (name: string, contents: string) => {
      writeFileSync(path.join(root, 'profiles', `${name}.rs`), contents);
    };

    it('runs the runscript instead of opening the tabs of the JSON file beside it', async () => {
      writeProfile('coding', JSON.stringify({ tabs: [{ type: 'editor', path: '$root/notes.md' }] }));
      writeRunscript('coding', 'harness claude\nfiles left\n');
      const janus = makeTab('janus', 'red');
      const { managers, appended } = makeManagers(janus);

      new ProfileManager(managers).run('profile launch coding', 'janus');

      await vi.waitFor(() => expect(managers.tab.enqueueSystemBatch).toHaveBeenCalled());
      expect(managers.tab.enqueueSystemBatch).toHaveBeenCalledWith('system', ['harness claude', 'files left']);
      expect(managers.openFile.edit).not.toHaveBeenCalled();
      expect(managers.tab.insertTabInGroup).not.toHaveBeenCalled();
      expect(appended).toEqual([]);
    });

    it('runs the runscript without reporting a malformed JSON file beside it', async () => {
      writeProfile('broken', JSON.stringify({ tabs: [{ type: 'harness', name: 'c' }] }));
      writeRunscript('broken', 'echo hi\n');
      const janus = makeTab('janus', 'red');
      const { managers, appended } = makeManagers(janus);

      new ProfileManager(managers).run('profile launch broken', 'janus');

      await vi.waitFor(() => expect(managers.tab.enqueueSystemBatch).toHaveBeenCalledWith('system', ['echo hi']));
      expect(appended).toEqual([]);
    });

    it('launches a runscript-only profile', async () => {
      writeRunscript('deploy', 'npm run build\n');
      const janus = makeTab('janus', 'red');
      const { managers, appended } = makeManagers(janus);

      new ProfileManager(managers).run('profile launch deploy', 'janus');

      await vi.waitFor(() => expect(managers.tab.enqueueSystemBatch).toHaveBeenCalledWith('system', ['npm run build']));
      expect(appended).toEqual([]);
    });

    it('reports a runscript launch that rejects in the issuing transcript', async () => {
      writeRunscript('deploy', 'npm run build\n');
      const janus = makeTab('janus', 'red');
      const { managers, appended } = makeManagers(janus);
      vi.mocked(managers.systemShell.ensure).mockRejectedValueOnce(new Error('shell unavailable'));

      new ProfileManager(managers).run('profile launch deploy', 'janus');

      await vi.waitFor(() => expect(appended).toHaveLength(1));
      expect(appended).toEqual([{ input: 'profile launch deploy', output: 'Profile command failed: shell unavailable.' }]);
    });

    it('lists a runscript-only profile', () => {
      writeRunscript('deploy', '');
      const janus = makeTab('janus', 'red');
      const { managers, appended } = makeManagers(janus);

      new ProfileManager(managers).run('profile list', 'janus');

      expect(appended[0].output.split('\n')).toContain('deploy');
    });

    it('associates listed profiles with the command invocation', () => {
      writeRunscript('deploy', '');
      const janus = makeTab('janus', 'red');
      const { managers } = makeManagers(janus);
      const invocation = {
        runId: 'run-1', invocationId: 'invocation-1',
        caller: { label: 'janus', cwd: '/proj', context: [] }, signal: new AbortController().signal,
      };

      new ProfileManager(managers).run('profile list', 'janus', invocation);

      expect(managers.tab.appendForInvocation).toHaveBeenCalledWith(
        'janus', { input: 'profile list', output: 'deploy' }, 'invocation-1',
      );
    });
  });
});
