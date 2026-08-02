import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveProfile, formatSaveSummary, type SaveSummary } from './save.js';
import { initProfileDir, profilePath } from '../profiles.js';
import { loadProfile } from './file.js';
import { setClientLayout } from '../client-layout.js';
import { setWindowBoundsReader } from '../window-resizer.js';
import {
  makeTab, makeHarnessTab, makeImageTab, makeMarkdownTab, makePageTab, makeEditorTab, makeFilesTab,
  makeNotificationsTab, makeSchedulesTab,
} from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { FileNavigatorDetail, MonitorTarget, Tab } from '../tab/types.js';
import type { LoadedProfile, ProfileFile } from './types.js';

type Snapshot = { name: string; persona: string; targets: MonitorTarget[]; inline: boolean }[];

function makeManagers(
  tabs: Tab[], cwdByLabel: Record<string, string> = {}, monitors: Snapshot = [], launchDir = '/proj',
  expandedByLabel: Record<string, string[]> = {},
  detailByLabel: Record<string, FileNavigatorDetail> = {},
): Managers {
  return {
    tab: { tabs, cwdOf: (label: string) => cwdByLabel[label], launchDir },
    monitor: { snapshot: () => monitors },
    fileNavigator: {
      expandedPaths: (label: string) => expandedByLabel[label] ?? [],
      detailOf: (label: string) => detailByLabel[label] ?? 'name',
    },
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

  it('writes one tabs array in tab-strip order, with a type on every element and no tab object', async () => {
    const bob = makeTab('bob', '#aaa');
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' });
    const notes = makeEditorTab('notes', '#ddd', 1, 1, '#ddd', { name: 'notes.txt', path: '/notes.txt', size: '1KB', url: '/open/1' });
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home', rows: [] }), dock: 'left' as const };
    const managers = makeManagers([bob, dockedFiles, claude, notes]);

    await saveProfile('demo', managers);

    const root = JSON.parse(readFileSync(profilePath('demo'), 'utf8')) as ProfileFile;
    expect(Object.keys(root)).toEqual(['tabs', 'layout']);
    expect(root.tabs?.map((entry) => entry.type)).toEqual(['agent', 'files', 'harness', 'editor']);
    expect(JSON.stringify(root.tabs)).not.toContain('"tab"');
  });

  it('writes a harness entry naming its binary with tool, not type', async () => {
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' });
    const managers = makeManagers([claude]);

    await saveProfile('demo', managers);

    const root = JSON.parse(readFileSync(profilePath('demo'), 'utf8')) as ProfileFile;
    expect(root.tabs?.[0]).toEqual(expect.objectContaining({ type: 'harness', tool: 'claude' }));
  });

  it('writes one clean-template agent entry per agent tab, with flat presentation fields', async () => {
    const bob = { ...makeTab('bob', '#aaa', 2, ['history line'], [{ input: 'ls', output: 'x' }], undefined, 3, '#bbb') };
    const managers = makeManagers([bob], { bob: '/work/bob' });

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      {
        name: 'bob', active: false, cwd: '/work/bob', dotColor: '#aaa', number: 2,
        group: 3, groupColor: '#bbb', focus: undefined, pane: 'left',
      },
    ]);
  });

  it('writes a harness entry with tool and flat presentation fields', async () => {
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', {
      name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running', model: 'sonnet', effort: 'high',
    });
    claude.offline = true;
    claude.autoApprove = true;
    const managers = makeManagers([claude], { claude: '/work/claude' });

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([{
      name: 'claude', tool: 'claude', model: 'sonnet', effort: 'high', workspace: false,
      offline: true, autoApprove: true, dotColor: '#ccc', cwd: '/work/claude',
      number: 1, group: 1, groupColor: '#ccc', focus: undefined, pane: 'left',
    }]);
  });

  it('writes focus only on the active main-area tab', async () => {
    const bob = makeTab('bob', '#aaa');
    const claude = makeHarnessTab('claude', '#ccc', 1, 1, '#ccc', { name: 'claude', program: 'claude', ptyId: 'pty1', status: 'running' });
    const notes = makeEditorTab('notes', '#ddd', 1, 1, '#ddd', { name: 'notes.txt', path: '/notes.txt', size: '1KB', url: '/open/1' });
    const managers = makeManagers([bob, claude, notes]);
    managers.tab.activeTab = 1;

    await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      expect.objectContaining({ name: 'bob', focus: undefined }),
      expect.objectContaining({ name: 'claude', focus: true }),
    ]);
    expect(load('demo').editors[0]?.focus).toBeUndefined();
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

  it('skips nothing now that image, ssh, and undocked navigator tabs are all captured', async () => {
    const image = makeImageTab('pic', '#111', 1, 1, '#111', { name: 'a.png', path: '/a.png', size: '1KB', url: '/open/1' });
    const ssh = makeHarnessTab('server', '#333', 1, 1, '#333', { name: 'ssh', program: 'ssh', ptyId: 'pty2', status: 'running', destination: 'host' });
    const undockedFiles = makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home', rows: [] });
    const managers = makeManagers([image, ssh, undockedFiles]);

    const summary = await saveProfile('demo', managers);

    expect(summary.skipped).toEqual([]);
    expect(load('demo').views.map((v) => v.type)).toEqual(['image', 'ssh']);
    expect(summary.fileNavigators).toBe(1);
  });

  it('writes an undocked navigator with presentation keys and no dock', async () => {
    const undockedFiles = makeFilesTab('nav', '#444', 3, 2, '#555', { root: '~', absoluteRoot: '/proj/src', rows: [] });
    const managers = makeManagers([undockedFiles], {}, [], '/proj', { nav: ['a', 'a/b'] });

    await saveProfile('demo', managers);

    expect(load('demo').files).toEqual([{
      path: '$root/src', expanded: ['a', 'a/b'], dotColor: '#444', number: 3, group: 2,
      groupColor: '#555', pane: 'left', focus: undefined, dock: undefined,
    }]);
  });

  it('writes a docked navigator with its expanded set and no presentation keys', async () => {
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/proj', rows: [] }), dock: 'left' as const };
    const managers = makeManagers([dockedFiles], {}, [], '/proj', { nav: ['src'] });

    await saveProfile('demo', managers);

    expect(load('demo').files).toEqual([{ dock: 'left', path: '$root/', expanded: ['src'] }]);
  });

  it('writes the navigator detail mode, and omits it for the default name mode', async () => {
    const sized = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/proj', rows: [] }), dock: 'left' as const };
    await saveProfile('demo', makeManagers([sized], {}, [], '/proj', { nav: ['src'] }, { nav: 'permissions' }));
    expect(load('demo').files[0].details).toBe('permissions');

    await saveProfile('demo', makeManagers([sized], {}, [], '/proj', { nav: ['src'] }, { nav: 'name' }));
    expect(load('demo').files[0].details).toBeUndefined();
  });

  it('omits the three selection keys when no client answers the request in time', async () => {
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/proj/src', rows: [] }), dock: 'left' as const };
    const managers = makeManagers([dockedFiles], {}, [], '/proj', { nav: ['src'] });

    await saveProfile('demo', managers);

    const entry = load('demo').files[0];
    expect(entry.expanded).toEqual(['src']);
    expect(entry.cursor).toBeUndefined();
    expect(entry.anchor).toBeUndefined();
    expect(entry.selected).toBeUndefined();
  });

  it('round-trips an image, markdown, page, and ssh tab through the views list', async () => {
    const image = makeImageTab('pic', '#111', 1, 1, '#111', { name: 'a.png', path: '/proj/a.png', size: '1KB', url: '/open/1' });
    const readme = makeMarkdownTab('readme', '#222', 2, 1, '#111', { name: 'readme.md', path: '/proj/readme.md', size: '1KB', url: '/open/2' });
    const page = makePageTab('site', '#333', 3, 1, '#111', { url: 'https://example.com/', domain: 'example.com', number: 1 });
    const ssh = makeHarnessTab('server', '#444', 4, 1, '#111', {
      name: 'ssh', program: 'ssh', ptyId: 'pty2', status: 'running', destination: 'host', sshOptions: ['-p', '2222'],
    });
    const managers = makeManagers([image, readme, page, ssh], {}, [], '/proj');

    const summary = await saveProfile('demo', managers);

    expect(load('demo').views).toEqual([
      expect.objectContaining({ type: 'image', path: '$root/a.png', number: 1 }),
      expect.objectContaining({ type: 'markdown', path: '$root/readme.md', number: 2 }),
      expect.objectContaining({ type: 'page', url: 'https://example.com/', number: 3 }),
      expect.objectContaining({ type: 'ssh', destination: 'host', options: ['-p', '2222'], number: 4 }),
    ]);
    expect(summary).toEqual(expect.objectContaining({ images: 1, markdown: 1, pages: 1, ssh: 1 }));
    expect(summary.skipped).toEqual([]);
  });

  it('writes an editor entry with flat presentation fields', async () => {
    const editor = makeEditorTab('notes', '#222', 1, 1, '#222', { name: 'notes.txt', path: '/notes.txt', size: '1KB', url: '/open/2' });
    const managers = makeManagers([editor]);

    const summary = await saveProfile('demo', managers);

    expect(load('demo').editors).toEqual([
      {
        path: '/notes.txt', dotColor: '#222', number: 1, group: 1, groupColor: '#222',
        pane: 'left', focus: undefined,
      },
    ]);
    expect(summary.editors).toBe(1);
  });

  it('writes an editor entry path relative to the project root when it is under the root', async () => {
    const editor = makeEditorTab('notes', '#222', 1, 1, '#222', { name: 'notes.txt', path: '/proj/src/notes.txt', size: '1KB', url: '/open/2' });
    const managers = makeManagers([editor], {}, [], '/proj');

    await saveProfile('demo', managers);

    expect(load('demo').editors).toEqual([expect.objectContaining({ path: '$root/src/notes.txt' })]);
  });

  it('writes a synced editor entry as its project-relative source path, not the workspace clone path', async () => {
    const editor = makeEditorTab('issues', '#222', 1, 1, '#222', {
      name: 'issues.md', path: '/proj/.janissary/workspace/git-sync/product/backlog/issues.md', size: '1KB', url: '/open/3', sync: 'synced',
    });
    const managers = makeManagers([editor], {}, [], '/proj');

    await saveProfile('demo', managers);

    expect(load('demo').editors).toEqual([expect.objectContaining({ path: '$root/product/backlog/issues.md' })]);
  });

  it('writes a still-provisioning synced editor entry as its project-relative source path too', async () => {
    const editor = makeEditorTab('issues', '#222', 1, 1, '#222', {
      name: 'issues.md', path: '/proj/.janissary/workspace/git-sync/product/backlog/issues.md', size: 'unknown', url: '/open/3', sync: 'provisioning',
    });
    const managers = makeManagers([editor], {}, [], '/proj');

    await saveProfile('demo', managers);

    expect(load('demo').editors).toEqual([expect.objectContaining({ path: '$root/product/backlog/issues.md' })]);
  });

  it('does not capture the root janus tab, and does not count or report it', async () => {
    const managers = makeManagers([makeTab('janus', '#000'), makeTab('bob', '#aaa')]);

    const summary = await saveProfile('demo', managers);

    expect(load('demo').entries).toEqual([
      {
        name: 'bob', active: false, cwd: undefined, dotColor: '#aaa', number: 1, group: 1,
        groupColor: '#aaa', focus: undefined, pane: 'left',
      },
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

  it('captures docked file-navigator/notifications/schedules tabs, counting navigators on their own', async () => {
    const dockedFiles = { ...makeFilesTab('nav', '#444', 1, 1, '#444', { root: '~', absoluteRoot: '/home/bob', rows: [] }), dock: 'left' as const };
    const notifications = { ...makeNotificationsTab('notifications', '#555', 1, 1, '#555'), dock: 'right' as const };
    const schedules = { ...makeSchedulesTab('schedules', '#666', 1, 1, '#666'), dock: 'right' as const };
    const managers = makeManagers([dockedFiles, notifications, schedules]);

    const summary = await saveProfile('demo', managers);

    expect(summary.dockedViews).toBe(2);
    expect(summary.fileNavigators).toBe(1);
    const loaded = load('demo');
    expect(loaded.files).toEqual([{ dock: 'left', path: '/home/bob' }]);
    expect(loaded.notifications).toEqual([{ dock: 'right' }]);
    expect(loaded.schedules).toEqual([{ dock: 'right' }]);
  });

  it('omits an empty tabs array and the monitors key while always keeping layout', async () => {
    const managers = makeManagers([makeTab('janus', '#000')]);

    await saveProfile('demo', managers);

    const root = JSON.parse(readFileSync(profilePath('demo'), 'utf8')) as ProfileFile;
    expect(Object.keys(root)).toEqual(['layout']);
    expect(load('demo').layout).not.toBeNull();
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

describe('formatSaveSummary', () => {
  function makeSummary(overrides: Partial<SaveSummary> = {}): SaveSummary {
    return {
      agents: 0, harnesses: 0, editors: 0, images: 0, markdown: 0, pages: 0, ssh: 0,
      fileNavigators: 0, monitors: 0, dockedViews: 0, skipped: [], notes: [], ...overrides,
    };
  }

  it('reports only layout when every count is zero and there are no notes or skips', () => {
    expect(formatSaveSummary('demo', makeSummary())).toBe('Saved profile "demo": layout.');
  });

  it('uses singular labels for a count of one', () => {
    const summary = makeSummary({
      agents: 1, harnesses: 1, editors: 1, images: 1, markdown: 1, pages: 1, ssh: 1,
      fileNavigators: 1, monitors: 1, dockedViews: 1,
    });

    expect(formatSaveSummary('demo', summary)).toBe(
      'Saved profile "demo": 1 agent, 1 harness, 1 editor tab, 1 image tab, 1 markdown tab, 1 page tab, '
      + '1 ssh tab, 1 file navigator, layout, 1 monitor, 1 docked tab.',
    );
  });

  it('uses plural labels for counts greater than one', () => {
    const summary = makeSummary({
      agents: 2, harnesses: 3, editors: 4, images: 2, markdown: 2, pages: 2, ssh: 2,
      fileNavigators: 2, monitors: 5, dockedViews: 6,
    });

    expect(formatSaveSummary('demo', summary)).toBe(
      'Saved profile "demo": 2 agents, 3 harnesses, 4 editor tabs, 2 image tabs, 2 markdown tabs, '
      + '2 page tabs, 2 ssh tabs, 2 file navigators, layout, 5 monitors, 6 docked tabs.',
    );
  });

  it('appends a notes line when notes are present', () => {
    const summary = makeSummary({ notes: ['Window size not captured (no window open).'] });

    expect(formatSaveSummary('demo', summary)).toBe(
      'Saved profile "demo": layout. Window size not captured (no window open).',
    );
  });

  it('appends a skipped line joining skipped tab names when present', () => {
    const summary = makeSummary({ skipped: ['pic', 'ssh'] });

    expect(formatSaveSummary('demo', summary)).toBe('Saved profile "demo": layout. Skipped: pic, ssh.');
  });

  it('appends both notes and skipped lines when both are present', () => {
    const summary = makeSummary({ notes: ['a note'], skipped: ['pic'] });

    expect(formatSaveSummary('demo', summary)).toBe('Saved profile "demo": layout. a note Skipped: pic.');
  });
});
