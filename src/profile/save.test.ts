import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveProfile } from './save.js';
import {
  initProfileDir, profilePath, loadProfileEntries, loadProfileMonitors, loadProfileFiles,
  loadProfileNotifications, loadProfileSchedules, loadProfileLayout,
} from '../profiles.js';
import { setClientLayout } from '../client-layout.js';
import { setWindowBoundsReader } from '../window-resizer.js';
import {
  makeTab, makeHarnessTab, makeImageTab, makeEditorTab, makeFilesTab, makeNotificationsTab, makeSchedulesTab,
} from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { MonitorTarget, Tab } from '../types.js';

type Snapshot = { persona: string; targets: MonitorTarget[]; inline: boolean }[];

function makeManagers(tabs: Tab[], cwdByLabel: Record<string, string> = {}, monitors: Snapshot = []): Managers {
  return {
    tab: { tabs, cwdOf: (label: string) => cwdByLabel[label] },
    monitor: { snapshot: () => monitors },
  } as unknown as Managers;
}

describe('saveProfile', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profsave-'));
    initProfileDir(root);
  });

  afterEach(() => {
    setWindowBoundsReader(undefined);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('writes one clean-template agent entry per agent tab', async () => {
    const bob = { ...makeTab('bob', '#aaa', 2, ['history line'], [{ input: 'ls', output: 'x' }], undefined, 3, '#bbb') };
    const managers = makeManagers([bob], { bob: '/work/bob' });

    await saveProfile('demo', managers);

    const entries = loadProfileEntries('demo');
    expect(entries).toEqual([
      { name: 'bob', dotColor: '#aaa', active: false, number: 2, group: 3, groupColor: '#bbb', cwd: '/work/bob' },
    ]);
  });

  it('writes a harness entry with the fields the plan specifies and no run/schedule', async () => {
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', {
      name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running', model: 'sonnet', effort: 'high',
    });
    claude.offline = true;
    claude.autoApprove = true;
    const managers = makeManagers([claude], { claude: '/work/claude' });

    await saveProfile('demo', managers);

    const entries = loadProfileEntries('demo');
    expect(entries).toEqual([{
      label: 'claude', harness: 'claude', model: 'sonnet', effort: 'high', workspace: false,
      offline: true, autoApprove: true, dotColor: '#ccc', cwd: '/work/claude', number: 1, group: 1,
    }]);
  });

  it('skips image, editor, ssh, and non-docked file-tree tabs, and reports them', async () => {
    const image = makeImageTab('pic', '#111', 1, 1, '#111', { name: 'a.png', path: '/a.png', size: '1KB', url: '/open/1' });
    const editor = makeEditorTab('notes', '#222', 1, 1, '#222', { name: 'notes.txt', path: '/notes.txt', size: '1KB', url: '/open/2' });
    const ssh = makeHarnessTab('server', '#333', 1, 1, '#333', { name: 'ssh', program: 'ssh', ptyId: 'pty2', status: 'running', destination: 'host' });
    const undockedFiles = makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home', rows: [] });
    const managers = makeManagers([image, editor, ssh, undockedFiles]);

    const summary = await saveProfile('demo', managers);

    expect(summary.skipped).toEqual(['pic', 'notes', 'server', 'nav']);
    expect(loadProfileEntries('demo')).toEqual([]);
  });

  it('does not capture the root janus tab, and does not count or report it', async () => {
    const janus = makeTab('janus', '#000');
    const bob = makeTab('bob', '#aaa');
    const managers = makeManagers([janus, bob]);

    const summary = await saveProfile('demo', managers);

    expect(loadProfileEntries('demo')).toEqual([
      { name: 'bob', dotColor: '#aaa', active: false, number: 1, group: 1, groupColor: '#aaa' },
    ]);
    expect(summary.agents).toBe(1);
    expect(summary.skipped).not.toContain('janus');
  });

  it('captures a tab labeled janus if it is not the first tab', async () => {
    const bob = makeTab('bob', '#aaa');
    const janus = makeTab('janus', '#000');
    const managers = makeManagers([bob, janus]);

    const summary = await saveProfile('demo', managers);

    expect(loadProfileEntries('demo')).toEqual([
      { name: 'bob', dotColor: '#aaa', active: false, number: 1, group: 1, groupColor: '#aaa' },
      { name: 'janus', dotColor: '#000', active: false, number: 1, group: 1, groupColor: '#000' },
    ]);
    expect(summary.agents).toBe(2);
  });

  it('captures a docked file-tree tab into _files.json (dock + literal path, no `in`) and a docked notifications/schedules tab', async () => {
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home/bob', rows: [] }), dock: 'left' as const };
    const notifications = { ...makeNotificationsTab('notifications', '#555', 1, 1, '#555'), dock: 'right' as const };
    const schedules = { ...makeSchedulesTab('schedules', '#666', 1, 1, '#666'), dock: 'right' as const };
    const managers = makeManagers([dockedFiles, notifications, schedules]);

    const summary = await saveProfile('demo', managers);

    expect(summary.dockedViews).toBe(3);
    expect(loadProfileFiles('demo')).toEqual([{ dock: 'left', path: '/home/bob' }]);
    expect(loadProfileNotifications('demo')).toEqual([{ dock: 'right' }]);
    expect(loadProfileSchedules('demo')).toEqual([{ dock: 'right' }]);
  });

  it('does not write _monitors.json/_files.json/_notifications.json/_schedules.json when nothing qualifies', async () => {
    const bob = makeTab('bob', '#aaa');
    const managers = makeManagers([bob]);

    await saveProfile('demo', managers);

    const dir = profilePath('demo');
    expect(existsSync(path.join(dir, '_monitors.json'))).toBe(false);
    expect(existsSync(path.join(dir, '_files.json'))).toBe(false);
    expect(existsSync(path.join(dir, '_notifications.json'))).toBe(false);
    expect(existsSync(path.join(dir, '_schedules.json'))).toBe(false);
  });

  it('captures live monitors via the monitor manager snapshot, authored as targets words', async () => {
    const bob = makeTab('bob', '#aaa');
    const monitors: Snapshot = [
      { persona: 'security', targets: [{ kind: 'tab', label: 'bob' }], inline: false },
      { persona: 'assistant', targets: [{ kind: 'tab', label: 'bob' }], inline: true },
    ];
    const managers = makeManagers([bob], {}, monitors);

    await saveProfile('demo', managers);

    expect(loadProfileMonitors('demo')).toEqual([
      { persona: 'security', targets: ['bob'] },
      { persona: 'assistant', targets: [] },
    ]);
  });

  it('overwrites an existing profile directory cleanly, leaving no stale files', async () => {
    const dir = profilePath('demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'stale.json'), '{}');
    const bob = makeTab('bob', '#aaa');
    const managers = makeManagers([bob]);

    await saveProfile('demo', managers);

    expect(existsSync(path.join(dir, 'stale.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'bob.json'))).toBe(true);
  });

  it('captures sidebar/tab-area sizes from getClientLayout and window bounds when a reader is registered', async () => {
    const bob = makeTab('bob', '#aaa');
    const managers = makeManagers([bob]);
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
    setWindowBoundsReader(async () => ({ width: 1440, height: 900 }));

    const summary = await saveProfile('demo', managers);

    expect(loadProfileLayout('demo')).toEqual({
      window: { width: 1440, height: 900 }, sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70,
    });
    expect(summary.notes).toEqual([]);
  });

  it('omits window from _layout.json and notes the skip when no bounds reader is registered', async () => {
    const bob = makeTab('bob', '#aaa');
    const managers = makeManagers([bob]);
    setClientLayout({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });

    const summary = await saveProfile('demo', managers);

    expect(loadProfileLayout('demo')).toEqual({ sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 70 });
    expect(summary.notes).toEqual(['Window size not captured (no window open).']);
  });
});
