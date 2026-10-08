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
import { messageBus } from '../bus.js';
import { resolveTreeSelections } from '../file-navigator/selection-request.js';

function makeManagers(creator: Tab, tabs: Tab[] = [creator]): { managers: Managers; appended: { input: string; output: string }[] } {
  const appended: { input: string; output: string }[] = [];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t: Tab) => t.label === label),
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
    manager.run('profile save', 'janus');

    expect(appended).toEqual([
      { input: 'profile launch', output: 'Usage: profile launch <name>' },
      { input: 'profile save', output: 'Usage: profile save <name>' },
    ]);
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
    writeProfile('good', JSON.stringify({ tabs: [{ type: 'harness', name: 'bob', tool: 'claude' }] }));
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
