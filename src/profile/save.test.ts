import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveProfile } from './save.js';
import { initProfileDir, profilePath, loadProfile } from '../profiles.js';
import { setClientLayout } from '../client-layout.js';
import { setWindowBoundsReader } from '../window-resizer.js';
import {
  makeTab, makeHarnessTab, makeImageTab, makeEditorTab, makeFilesTab, makeNotificationsTab, makeSchedulesTab,
} from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { LoadedProfile, MonitorTarget, Tab } from '../types.js';

type Snapshot = { name: string; persona: string; targets: MonitorTarget[]; inline: boolean }[];

function makeManagers(
  tabs: Tab[], cwdByLabel: Record<string, string> = {}, monitors: Snapshot = [], launchDir = '/proj',
): Managers {
  return {
    tab: { tabs, cwdOf: (label: string) => cwdByLabel[label], launchDir },
    monitor: { snapshot: () => monitors },
  } as unknown as Managers;
}

function load(name: string): LoadedProfile {
  const loaded = loadProfile(name);
  if ('error' in loaded) throw new Error(`expected a valid profile, got: ${loaded.error}`);
  return loaded;
}

describe('saveProfile', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profsave-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
  });

  afterEach(() => {
    setWindowBoundsReader(undefined);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('writes exactly one profiles/<name>.json file', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa')]);

    await saveProfile('demo', managers);

    expect(statSync(profilePath('demo')).isFile()).toBe(true);
    expect(existsSync(path.join(root, 'profiles', 'demo'))).toBe(false);
  });

  it('writes one clean-template agent entry per agent tab, with a nested tab object', async () => {
    const bob = { ...makeTab('bob', '#aaa', 2, ['history line'], [{ input: 'ls', output: 'x' }], undefined, 3, '#bbb') };
    const managers = makeManagers([bob], { bob: '/work/bob' });

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      { name: 'bob', active: false, cwd: '/work/bob', dotColor: '#aaa', number: 2, group: 3, groupColor: '#bbb' },
    ]);
  });

  it('writes a harness entry with type and a nested tab object', async () => {
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', {
      name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running', model: 'sonnet', effort: 'high',
    });
    claude.offline = true;
    claude.autoApprove = true;
    const managers = makeManagers([claude], { claude: '/work/claude' });

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([{
      name: 'claude', type: 'claude', model: 'sonnet', effort: 'high', workspace: false,
      offline: true, autoApprove: true, dotColor: '#ccc', cwd: '/work/claude', number: 1, group: 1,
    }]);
  });

  it('writes focus only on the active main-area tab', async () => {
    const bob = makeTab('bob', '#aaa');
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' });
    const managers = makeManagers([bob, claude]);
    managers.tab.activeTab = 1;

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      expect.objectContaining({ name: 'bob', focus: undefined }),
      expect.objectContaining({ name: 'claude', focus: true }),
    ]);
  });

  it('writes an agent entry cwd relative to the project root when it is under the root', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa')], { bob: '/proj/src/deep' }, [], '/proj');

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([expect.objectContaining({ cwd: '$root/src/deep' })]);
  });

  it('writes a harness entry cwd relative to the project root when it is under the root', async () => {
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', {
      name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running',
    });
    const managers = makeManagers([claude], { claude: '/proj/src' }, [], '/proj');

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([expect.objectContaining({ cwd: '$root/src' })]);
  });

  it('skips image, editor, ssh, and non-docked file-tree tabs, and reports them', async () => {
    const image = makeImageTab('pic', '#111', 1, 1, '#111', { name: 'a.png', path: '/a.png', size: '1KB', url: '/open/1' });
    const editor = makeEditorTab('notes', '#222', 1, 1, '#222', { name: 'notes.txt', path: '/notes.txt', size: '1KB', url: '/open/2' });
    const ssh = makeHarnessTab('server', '#333', 1, 1, '#333', { name: 'ssh', program: 'ssh', ptyId: 'pty2', status: 'running', destination: 'host' });
    const undockedFiles = makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home', rows: [] });
    const managers = makeManagers([image, editor, ssh, undockedFiles]);

    const summary = await saveProfile('demo', managers);

    expect(summary.skipped).toEqual(['pic', 'notes', 'server', 'nav']);
    expect(load('demo').entries).toEqual([]);
  });

  it('does not capture the root janus tab, and does not count or report it', async () => {
    const managers = makeManagers([makeTab('janus', '#000'), makeTab('bob', '#aaa')]);

    const summary = await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      { name: 'bob', active: false, dotColor: '#aaa', number: 1, group: 1, groupColor: '#aaa' },
    ]);
    expect(summary.agents).toBe(1);
    expect(summary.skipped).not.toContain('janus');
  });

  it('captures a tab labeled janus if it is not the first tab', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa'), makeTab('janus', '#000')]);

    const summary = await saveProfile('demo', managers);

    expect(load('demo').entries.map((e) => e.name)).toEqual(['bob', 'janus']);
    expect(summary.agents).toBe(2);
  });

  it('captures docked file-tree/notifications/schedules tabs into their config keys', async () => {
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home/bob', rows: [] }), dock: 'left' as const };
    const notifications = { ...makeNotificationsTab('notifications', '#555', 1, 1, '#555'), dock: 'right' as const };
    const schedules = { ...makeSchedulesTab('schedules', '#666', 1, 1, '#666'), dock: 'right' as const };
    const managers = makeManagers([dockedFiles, notifications, schedules]);

    const summary = await saveProfile('demo', managers);

    expect(summary.dockedViews).toBe(3);
    const loaded = load('demo');
    expect(loaded.files).toEqual([{ dock: 'left', path: '/home/bob' }]);
    expect(loaded.notifications).toEqual([{ dock: 'right' }]);
    expect(loaded.schedules).toEqual([{ dock: 'right' }]);
  });

  it('omits empty config sections while always keeping layout', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa')]);

    await saveProfile('demo', managers);

    const loaded = load('demo');
    expect(loaded.monitors).toEqual([]);
    expect(loaded.files).toEqual([]);
    expect(loaded.notifications).toEqual([]);
    expect(loaded.schedules).toEqual([]);
    expect(loaded.layout).not.toBeNull();
  });

  it('captures live monitors via the snapshot, each with a name, authored as target words', async () => {
    const monitors: Snapshot = [
      { name: 'security', persona: 'security', targets: [{ kind: 'tab', label: 'bob' }], inline: false },
      { name: 'assistant', persona: 'assistant', targets: [{ kind: 'tab', label: 'bob' }], inline: true },
    ];
    const managers = makeManagers([makeTab('bob', '#aaa')], {}, monitors);

    await saveProfile('demo', managers);

    expect(load('demo').monitors).toEqual([
      { name: 'security', persona: 'security', targets: ['bob'] },
      { name: 'assistant', persona: 'assistant', targets: [] },
    ]);
  });

  it('removes a stale old-format directory and overwrites cleanly', async () => {
    const staleDir = path.join(root, 'profiles', 'demo');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(path.join(staleDir, 'stale.json'), '{}');
    const managers = makeManagers([makeTab('bob', '#aaa')]);

    await saveProfile('demo', managers);

    expect(existsSync(staleDir)).toBe(false);
    expect(statSync(profilePath('demo')).isFile()).toBe(true);
    expect(load('demo').entries.map((e) => e.name)).toEqual(['bob']);
  });

  it('captures sidebar/tab-area sizes and window bounds when a reader is registered', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa')]);
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
    setWindowBoundsReader(async () => ({ width: 1440, height: 900 }));

    const summary = await saveProfile('demo', managers);

    expect(load('demo').layout).toEqual({
      window: { width: 1440, height: 900 }, sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70,
    });
    expect(summary.notes).toEqual([]);
  });

  it('omits window and notes the skip when no bounds reader is registered', async () => {
    const managers = makeManagers([makeTab('bob', '#aaa')]);
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });

    const summary = await saveProfile('demo', managers);

    expect(load('demo').layout).toEqual({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
    expect(summary.notes).toEqual(['Window size not captured (no window open).']);
  });
});
