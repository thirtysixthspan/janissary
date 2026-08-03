import { describe, expect, it, vi } from 'vitest';
import { openProfileViewTabs } from './view-tabs.js';
import { makeTab, makePluginTab, makePageTab, makeHarnessTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const identityColor = (_group: number, fallbackDotColor: string): string => fallbackDotColor;

function imageTab(label: string, number: number, path: string): Tab {
  return makePluginTab(label, 'blue', number, 1, 'blue', 'a.png', {
    id: 'image', instanceKey: path, schemaVersion: 1,
    payload: { name: 'a.png', path, size: '1KB', url: '/open/1' },
    fileRefs: ['1'], sourceLabel: 'janus',
  });
}

function markdownTab(label: string, number: number, path: string): Tab {
  return makePluginTab(label, 'blue', number, 1, 'blue', 'a.md', {
    id: 'markdown', instanceKey: path, schemaVersion: 1,
    payload: { name: 'a.md', path, size: '1KB', url: '/open/2' },
    fileRefs: ['2'], sourceLabel: 'janus',
  });
}

// A mutable-tabs mock in the shape `editors.test.ts` uses, extended with the two managers the view
// openers issue their commands through. Each stub appends the tab that real command would create.
// The image branch resolves asynchronously, as a real plugin opener does: its tab exists only once
// the promise `open` returns has settled.
// A plugin that opens on no file, reached by its own command — the shape the schedules plugin has.
function schedulesTab(label: string, number: number): Tab {
  return makePluginTab(label, 'blue', number, 1, 'blue', 'schedules', {
    id: 'schedules', instanceKey: 'schedules', schemaVersion: 1,
    payload: { entries: [] }, fileRefs: [], sourceLabel: 'janus',
  });
}

function makeManagers(initial: Tab[]): {
  managers: Managers; open: ReturnType<typeof vi.fn>; ssh: ReturnType<typeof vi.fn>;
  runCommand: ReturnType<typeof vi.fn>;
} {
  let tabs = initial;
  let activeTab = 0;
  const append = (tab: Tab) => { tabs = [...tabs, tab]; activeTab = tabs.length - 1; };
  const open = vi.fn(async (command: string) => {
    const target = command.replace(/^open\s+/, '').replace('$root', '/proj');
    if (target.startsWith('https://')) {
      append(makePageTab(`page-${tabs.length}`, 'blue', tabs.length + 1, 1, 'blue', { url: target, domain: 'example.com', number: 1 }));
      return;
    }
    await Promise.resolve();
    if (target.endsWith('.missing')) return;
    const existing = tabs.find((t) => t.plugin?.instanceKey === target);
    if (existing) { activeTab = tabs.indexOf(existing); return; }
    if (target.endsWith('.md')) {
      append(markdownTab(`markdown-${tabs.length}`, tabs.length + 1, target));
      return;
    }
    append(imageTab(`image-${tabs.length}`, tabs.length + 1, target));
  });
  const runCommand = vi.fn(async () => {
    await Promise.resolve();
    if (tabs.every((t) => t.plugin?.id !== 'schedules')) {
      append(schedulesTab(`schedules-${tabs.length}`, tabs.length + 1));
    }
  });
  const ssh = vi.fn((command: string) => {
    const destination = command.split(/\s+/, 2)[1];
    if (!destination) return 'Usage: ssh <destination> [ssh options].';
    append(makeHarnessTab(`ssh-${tabs.length}`, 'blue', tabs.length + 1, 1, 'blue', {
      name: 'ssh', program: 'ssh', ptyId: 'pty1', status: 'running', destination,
    }));
  });
  const managers = {
    tab: {
      get tabs() { return tabs; },
      set tabs(value: Tab[]) { tabs = value; },
      get activeTab() { return activeTab; },
      setActiveTab: vi.fn((index: number) => { activeTab = index; }),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      closeTab: vi.fn((index: number) => { tabs = tabs.toSpliced(index, 1); }),
      setDock: vi.fn((index: number, dock: 'left' | 'right' | null) => {
        tabs[index].dock = dock ?? undefined;
      }),
      cwdOf: () => '/cwd',
      launchDir: '/proj',
    },
    openFile: { run: open },
    ssh: { run: ssh },
    plugins: {
      declarations: [
        { id: 'image', fileExtensions: { '.png': 'image/png' } },
        { id: 'schedules', fileExtensions: {}, command: 'schedules' },
      ],
      runCommand,
    },
  } as unknown as Managers;
  return { managers, open, runCommand, ssh };
}

describe('openProfileViewTabs', () => {
  it('opens each type through the manager that owns its command', async () => {
    const { managers, open, ssh } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);

    const opened = await openProfileViewTabs([
      { type: 'plugin', id: 'image', path: '$root/a.png' },
      { type: 'plugin', id: 'markdown', path: '$root/a.md' },
      { type: 'page', url: 'https://example.com/' },
      { type: 'ssh', destination: 'host', options: ['-p', '2222'] },
    ], managers, 'janus', 1, identityColor, []);

    expect(open).toHaveBeenCalledWith('open $root/a.png', 'janus');
    expect(open).toHaveBeenCalledWith('open $root/a.md', 'janus');
    expect(open).toHaveBeenCalledWith('open https://example.com/', 'janus');
    expect(ssh).toHaveBeenCalledWith('ssh host -p 2222');
    expect(opened.map((c) => c.label)).toEqual(['image-1', 'markdown-2', 'page-3', 'ssh-4']);
  });

  it('carries the authored number, focus, and pane into the launch candidate', async () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'image', path: '$root/a.png', number: 4, focus: true, pane: 'right' }],
      managers, 'janus', 1, identityColor, [],
    );

    expect(opened).toEqual([{ label: 'image-1', number: 4, focus: true, pane: 'right' }]);
  });

  it('relocates a new tab into its authored group', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'green', 2, [], [], undefined, 2, 'green');
    const { managers } = makeManagers([janus, other]);
    const colorForGroup = (group: number, fallback: string): string =>
      managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallback;

    await openProfileViewTabs(
      [{ type: 'plugin', id: 'image', path: '$root/a.png', group: 2 }],
      managers, 'janus', 1, colorForGroup, [],
    );

    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group }))).toEqual([
      { label: 'janus', group: 1 },
      { label: 'other', group: 2 },
      { label: 'image-2', group: 2 },
    ]);
  });

  it('closes an already-open page or ssh tab first, leaving exactly one of each', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const site = makePageTab('site', 'blue', 3, 1, 'blue', { url: 'https://example.com/', domain: 'example.com', number: 1 });
    const server = makeHarnessTab('server', 'blue', 4, 1, 'blue', { name: 'ssh', program: 'ssh', ptyId: 'p', status: 'running', destination: 'host' });
    const { managers } = makeManagers([janus, site, server]);
    const notes: string[] = [];

    await openProfileViewTabs([
      { type: 'page', url: 'https://example.com/' },
      { type: 'ssh', destination: 'host' },
    ], managers, 'janus', 1, identityColor, notes);

    expect(managers.tab.tabs.filter((t) => t.page)).toHaveLength(1);
    expect(managers.tab.tabs.filter((t) => t.harness?.name === 'ssh')).toHaveLength(1);
    expect(notes).toContain('Relaunched "site".');
    expect(notes).toContain('Relaunched "server".');
  });

  // A markdown preview tab is a plugin tab like any other: reopening the same file focuses the tab
  // already showing it rather than closing and reopening it.
  it('reuses an already-open markdown tab on the same path', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const readme = markdownTab('readme', 2, '/proj/a.md');
    const { managers } = makeManagers([janus, readme]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'markdown', path: '$root/a.md' }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(managers.tab.tabs.filter((t) => t.plugin)).toHaveLength(1);
    expect(opened.map((c) => c.label)).toEqual(['readme']);
    expect(notes).not.toContain('Relaunched "readme".');
  });

  it('reuses an already-open plugin tab on the same path, and still places it in its authored group', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'green', 2, [], [], undefined, 2, 'green');
    const pic = imageTab('pic', 3, '/proj/a.png');
    const { managers } = makeManagers([janus, other, pic]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'image', path: '$root/a.png', group: 2 }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(managers.tab.tabs.filter((t) => t.plugin)).toHaveLength(1);
    expect(opened).toEqual([{ label: 'pic', number: undefined, focus: undefined, pane: undefined }]);
    expect(managers.tab.tabs.find((t) => t.label === 'pic')?.group).toBe(2);
    expect(notes).not.toContain('Relaunched "pic".');
  });

  // A plugin entry names its plugin in the note, so a saved image tab still reports the way it did
  // before the image view moved into a plugin.
  // A docked plugin tab has no place in the strip, so it takes no group, number, focus, or pane —
  // the shape a docked file navigator already has.
  it('docks a plugin entry that asks for a sidebar, and gives it no strip position', async () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'image', path: '$root/a.png', dock: 'left' }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(opened).toEqual([]);
    expect(managers.tab.tabs.find((tab) => tab.plugin)?.dock).toBe('left');
    expect(notes).toEqual(['Opened image tab.']);
  });

  // A plugin claiming no file extensions has no file to reopen from, so its entry carries no path
  // and the relaunch reissues the command that opened it — straight through the plugin host, so it
  // never lands in the issuing tab's command history.
  it('reopens a path-less plugin entry by running the plugin\'s own command', async () => {
    const { managers, open, runCommand } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'schedules', dock: 'right' }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(runCommand).toHaveBeenCalledWith('schedules', 'schedules', { label: 'janus', command: 'schedules' });
    expect(open).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
    expect(managers.tab.tabs.find((tab) => tab.plugin?.id === 'schedules')?.dock).toBe('right');
    expect(notes).toEqual(['Opened schedules tab.']);
  });

  it('reuses an already-open tab for a path-less plugin entry rather than opening a second', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus, schedulesTab('schedules', 2)]);
    const notes: string[] = [];

    await openProfileViewTabs(
      [{ type: 'plugin', id: 'schedules' }], managers, 'janus', 1, identityColor, notes,
    );

    expect(managers.tab.tabs.filter((tab) => tab.plugin?.id === 'schedules')).toHaveLength(1);
  });

  it('reports an entry that opened no tab and moves on', async () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'image', path: '$root/gone.missing' }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(opened).toEqual([]);
    expect(notes).toEqual(['Could not open image tab "$root/gone.missing".']);
  });

  it('does not match a tab another plugin opened on the same path', async () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const { managers } = makeManagers([janus]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs(
      [{ type: 'plugin', id: 'video', path: '$root/a.png' }],
      managers, 'janus', 1, identityColor, notes,
    );

    expect(opened).toEqual([]);
    expect(notes).toEqual(['Could not open video tab "$root/a.png".']);
  });

  it('reports the ssh manager\'s own error when the invocation does not parse', async () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = await openProfileViewTabs([{ type: 'ssh', destination: '' }], managers, 'janus', 1, identityColor, notes);

    expect(opened).toEqual([]);
    expect(notes).toEqual(['Usage: ssh <destination> [ssh options].']);
  });
});
