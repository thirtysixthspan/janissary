import { describe, expect, it, vi } from 'vitest';
import { openProfileViewTabs } from './view-tabs.js';
import { makeTab, makeImageTab, makeMarkdownTab, makePageTab, makeHarnessTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const identityColor = (_group: number, fallbackDotColor: string): string => fallbackDotColor;

// A mutable-tabs mock in the shape `editors.test.ts` uses, extended with the two managers the view
// openers issue their commands through. Each stub appends the tab that real command would create.
function makeManagers(initial: Tab[]): {
  managers: Managers; open: ReturnType<typeof vi.fn>; ssh: ReturnType<typeof vi.fn>;
} {
  let tabs = initial;
  let activeTab = 0;
  const append = (tab: Tab) => { tabs = [...tabs, tab]; activeTab = tabs.length - 1; };
  const open = vi.fn((command: string) => {
    const target = command.replace(/^open\s+/, '').replace('$root', '/proj');
    if (target.startsWith('https://')) {
      append(makePageTab(`page-${tabs.length}`, 'blue', tabs.length + 1, 1, 'blue', { url: target, domain: 'example.com', number: 1 }));
      return;
    }
    if (target.endsWith('.md')) {
      append(makeMarkdownTab(`md-${tabs.length}`, 'blue', tabs.length + 1, 1, 'blue', { name: 'a.md', path: target, size: '1KB', url: '/open/1' }));
      return;
    }
    if (target.endsWith('.missing')) return;
    const existing = tabs.find((t) => t.image?.path === target);
    if (existing) { activeTab = tabs.indexOf(existing); return; }
    append(makeImageTab(`image-${tabs.length}`, 'blue', tabs.length + 1, 1, 'blue', { name: 'a.png', path: target, size: '1KB', url: '/open/1' }));
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
      cwdOf: () => '/cwd',
      launchDir: '/proj',
    },
    openFile: { run: open },
    ssh: { run: ssh },
  } as unknown as Managers;
  return { managers, open, ssh };
}

describe('openProfileViewTabs', () => {
  it('opens each type through the manager that owns its command', () => {
    const { managers, open, ssh } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);

    const opened = openProfileViewTabs([
      { type: 'image', path: '$root/a.png' },
      { type: 'markdown', path: '$root/a.md' },
      { type: 'page', url: 'https://example.com/' },
      { type: 'ssh', destination: 'host', options: ['-p', '2222'] },
    ], managers, 'janus', 1, identityColor, []);

    expect(open).toHaveBeenCalledWith('open $root/a.png', 'janus');
    expect(open).toHaveBeenCalledWith('open $root/a.md', 'janus');
    expect(open).toHaveBeenCalledWith('open https://example.com/', 'janus');
    expect(ssh).toHaveBeenCalledWith('ssh host -p 2222');
    expect(opened.map((c) => c.label)).toEqual(['image-1', 'md-2', 'page-3', 'ssh-4']);
  });

  it('carries the authored number, focus, and pane into the launch candidate', () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);

    const opened = openProfileViewTabs(
      [{ type: 'image', path: '$root/a.png', number: 4, focus: true, pane: 'right' }],
      managers, 'janus', 1, identityColor, [],
    );

    expect(opened).toEqual([{ label: 'image-1', number: 4, focus: true, pane: 'right' }]);
  });

  it('relocates a new tab into its authored group', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'green', 2, [], [], undefined, 2, 'green');
    const { managers } = makeManagers([janus, other]);
    const colorForGroup = (group: number, fallback: string): string =>
      managers.tab.tabs.find((t) => t.group === group)?.groupColor ?? fallback;

    openProfileViewTabs([{ type: 'image', path: '$root/a.png', group: 2 }], managers, 'janus', 1, colorForGroup, []);

    expect(managers.tab.tabs.map((t) => ({ label: t.label, group: t.group }))).toEqual([
      { label: 'janus', group: 1 },
      { label: 'other', group: 2 },
      { label: 'image-2', group: 2 },
    ]);
  });

  it('closes an already-open markdown, page, or ssh tab first, leaving exactly one of each', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const readme = makeMarkdownTab('readme', 'blue', 2, 1, 'blue', { name: 'a.md', path: '/proj/a.md', size: '1KB', url: '/open/1' });
    const site = makePageTab('site', 'blue', 3, 1, 'blue', { url: 'https://example.com/', domain: 'example.com', number: 1 });
    const server = makeHarnessTab('server', 'blue', 4, 1, 'blue', { name: 'ssh', program: 'ssh', ptyId: 'p', status: 'running', destination: 'host' });
    const { managers } = makeManagers([janus, readme, site, server]);
    const notes: string[] = [];

    openProfileViewTabs([
      { type: 'markdown', path: '$root/a.md' },
      { type: 'page', url: 'https://example.com/' },
      { type: 'ssh', destination: 'host' },
    ], managers, 'janus', 1, identityColor, notes);

    expect(managers.tab.tabs.filter((t) => t.markdown)).toHaveLength(1);
    expect(managers.tab.tabs.filter((t) => t.page)).toHaveLength(1);
    expect(managers.tab.tabs.filter((t) => t.harness?.name === 'ssh')).toHaveLength(1);
    expect(notes).toContain('Relaunched "readme".');
    expect(notes).toContain('Relaunched "site".');
    expect(notes).toContain('Relaunched "server".');
  });

  it('reuses an already-open image at the same path, and still places it in its authored group', () => {
    const janus = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
    const other = makeTab('other', 'green', 2, [], [], undefined, 2, 'green');
    const pic = makeImageTab('pic', 'blue', 3, 1, 'blue', { name: 'a.png', path: '/proj/a.png', size: '1KB', url: '/open/1' });
    const { managers } = makeManagers([janus, other, pic]);
    const notes: string[] = [];

    const opened = openProfileViewTabs([{ type: 'image', path: '$root/a.png', group: 2 }], managers, 'janus', 1, identityColor, notes);

    expect(managers.tab.tabs.filter((t) => t.image)).toHaveLength(1);
    expect(opened).toEqual([{ label: 'pic', number: undefined, focus: undefined, pane: undefined }]);
    expect(managers.tab.tabs.find((t) => t.label === 'pic')?.group).toBe(2);
    expect(notes).not.toContain('Relaunched "pic".');
  });

  it('reports an entry that opened no tab and moves on', () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = openProfileViewTabs([{ type: 'image', path: '$root/gone.missing' }], managers, 'janus', 1, identityColor, notes);

    expect(opened).toEqual([]);
    expect(notes).toEqual(['Could not open image tab "$root/gone.missing".']);
  });

  it('reports the ssh manager\'s own error when the invocation does not parse', () => {
    const { managers } = makeManagers([makeTab('janus', 'red', 1, [], [], undefined, 1, 'red')]);
    const notes: string[] = [];

    const opened = openProfileViewTabs([{ type: 'ssh', destination: '' }], managers, 'janus', 1, identityColor, notes);

    expect(opened).toEqual([]);
    expect(notes).toEqual(['Usage: ssh <destination> [ssh options].']);
  });
});
