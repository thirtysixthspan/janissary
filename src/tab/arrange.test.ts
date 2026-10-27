import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { makeTab } from './index.js';
import { TabManager } from './manager.js';
import type { Tab } from './types.js';

const managers: TabManager[] = [];

afterEach(() => {
  for (const manager of managers) manager.dispose();
  managers.length = 0;
});

function tab(label: string, group = 1, fields: Partial<Tab> = {}): Tab {
  return { ...makeTab(label, '#123456', 1, [], [], undefined, group, `#${String(group).padStart(6, '0')}`), ...fields };
}

function setup(tabs: Tab[] = [tab('janus')], activeLabel = tabs[0]?.label ?? ''): TabManager {
  const services = {} as Managers;
  const manager = new TabManager(services, '/repo');
  services.tab = manager;
  manager.tabs = tabs;
  for (const [index, entry] of manager.tabs.entries()) entry.number = index + 1;
  manager.activeTab = manager.tabs.findIndex((entry) => entry.label === activeLabel);
  managers.push(manager);
  return manager;
}

function arrangeWithDirty(manager: TabManager, label: string, change: Parameters<TabManager['arrangeTab']>[1]) {
  const dirty = vi.fn();
  const subscription = messageBus.on('state', 'dirty', dirty);
  const result = manager.arrangeTab(label, change);
  subscription.unsubscribe();
  return { dirty, result };
}

describe('TabManager.arrangeTab move', () => {
  it('moves a center tab to each place in its group without crossing group or pane boundaries', () => {
    const root = tab('root');
    const second = tab('second');
    const otherGroup = tab('other', 2);
    const right = tab('right', 1, { pane: 'right' });
    const manager = setup([root, second, otherGroup, right]);

    expect(manager.arrangeTab('second', { kind: 'move', position: 1 })).toBe(true);
    expect(manager.tabs.map((entry) => entry.label)).toEqual(['second', 'root', 'other', 'right']);
    expect(manager.arrangeTab('second', { kind: 'move', position: 99 })).toBe(true);
    expect(manager.tabs.map((entry) => entry.label)).toEqual(['root', 'second', 'other', 'right']);
    expect(manager.activeTab).toBe(manager.findIndex('root'));
  });

  it('reorders docked tabs across groups, hidden system tabs in their group, and monitor tabs', () => {
    const sidebarA = tab('files', 1, { view: 'files', dock: 'left' });
    const sidebarB = tab('notifications', 2, { view: 'notifications', dock: 'left' });
    const sidebarC = tab('plugin', 3, { view: 'plugin', dock: 'left' });
    const manager = setup([tab('janus'), sidebarA, sidebarB, sidebarC]);
    manager.arrangeTab('plugin', { kind: 'move', position: 1 });
    expect(manager.tabs.map((entry) => entry.label)).toEqual(['janus', 'plugin', 'files', 'notifications']);

    const hidden = tab('system', 1, { hidden: true, systemShell: true });
    const visible = tab('visible', 1);
    const hiddenManager = setup([hidden, visible]);
    hiddenManager.arrangeTab('system', { kind: 'move', position: 2 });
    expect(hiddenManager.tabs.map((entry) => entry.label)).toEqual(['visible', 'system']);
    expect(hiddenManager.byLabel('system')?.hidden).toBe(true);

    const monitor = tab('monitor', 0, { view: 'monitor' });
    const report = tab('report', 0, { view: 'monitor' });
    const monitorManager = setup([tab('janus'), monitor, report]);
    monitorManager.arrangeTab('report', { kind: 'move', position: 1 });
    expect(monitorManager.tabs.map((entry) => entry.label)).toEqual(['janus', 'report', 'monitor']);
  });
});

describe('TabManager.arrangeTab pane and split', () => {
  it('opens a split for a non-active tab without changing focus', () => {
    const manager = setup([tab('active'), tab('moved')]);
    const { result, dirty } = arrangeWithDirty(manager, 'moved', { kind: 'pane', side: 'right' });
    expect(result).toBe(true);
    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
    expect(manager.tabs[manager.findIndex('moved')]?.pane).toBe('right');
    expect(manager.secondaryTabLabel).toBe('moved');
    expect(dirty).toHaveBeenCalledOnce();
  });

  it('keeps an active tab active when split moves it, restoring the pane it left', () => {
    const manager = setup([tab('active'), tab('other')]);
    manager.arrangeTab('active', { kind: 'split' });
    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
    expect(manager.tabs[manager.findIndex('active')]?.pane).toBe('right');
    expect(manager.secondaryTabLabel).toBe('other');
  });

  it('moves a visible secondary into the active pane and selects a recent tab in the pane it left', () => {
    const manager = setup([
      tab('active'), tab('right-one', 1, { pane: 'right' }), tab('right-two', 1, { pane: 'right' }),
    ]);
    manager.secondaryTabLabel = 'right-one';
    manager.focusHistory = ['right-two'];

    manager.arrangeTab('right-one', { kind: 'split' });

    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
    expect(manager.tabs[manager.findIndex('right-one')]?.pane).toBeUndefined();
    expect(manager.secondaryTabLabel).toBe('right-two');
  });

  it('collapses the split without changing focus when the moved tab empties its pane', () => {
    const manager = setup([tab('active'), tab('secondary', 1, { pane: 'right' })]);
    manager.secondaryTabLabel = 'secondary';

    manager.arrangeTab('secondary', { kind: 'split' });

    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
    expect(manager.tabs.every((entry) => entry.pane === undefined)).toBe(true);
    expect(manager.secondaryTabLabel).toBeUndefined();
  });

  it('refuses hidden, docked, notification, and monitor tabs and a one-tab unsplit strip', () => {
    const manager = setup([
      tab('active'),
      tab('hidden', 1, { hidden: true }),
      tab('docked', 1, { view: 'files', dock: 'left' }),
      tab('notifications', 1, { view: 'notifications' }),
      tab('monitor', 0, { view: 'monitor' }),
    ]);
    for (const label of ['hidden', 'docked', 'notifications', 'monitor']) {
      expect(manager.arrangeTab(label, { kind: 'split' })).toBe(false);
    }
    const only = setup([tab('only')]);
    expect(only.arrangeTab('only', { kind: 'pane', side: 'right' })).toBe(false);
  });
});

describe('TabManager.arrangeTab color and group', () => {
  it('sets only the dot color, including on reporting tabs', () => {
    const first = tab('active');
    const monitor = tab('monitor', 0, { view: 'monitor', groupColor: '#abcdef' });
    const manager = setup([first, monitor]);
    manager.arrangeTab('monitor', { kind: 'color', color: '#FF8800' });
    expect(monitor.dotColor).toBe('#FF8800');
    expect(monitor.groupColor).toBe('#abcdef');
  });

  it('joins an existing group after its last member while retaining pane and dock placement', () => {
    const manager = setup([
      tab('active'),
      tab('moved', 3, { pane: 'right', dock: 'left' }),
      tab('group-two-a', 2, { groupName: 'Review', groupColor: '#aabbcc' }),
      tab('group-two-b', 2, { groupName: 'Review', groupColor: '#aabbcc' }),
    ]);
    manager.arrangeTab('moved', { kind: 'group', selector: 'review' });
    expect(manager.tabs.map((entry) => entry.label)).toEqual(['active', 'group-two-a', 'group-two-b', 'moved']);
    expect(manager.byLabel('moved')).toMatchObject({ group: 2, groupName: 'Review', groupColor: '#aabbcc', pane: 'right', dock: 'left' });
    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
  });

  it('creates unknown named and numeric groups and refuses to group a monitor', () => {
    const manager = setup([tab('active'), tab('moved'), tab('existing', 4)]);
    manager.arrangeTab('moved', { kind: 'group', selector: 'Scratch' });
    expect(manager.byLabel('moved')).toMatchObject({ group: 5, groupName: 'Scratch', groupColor: '#123456' });
    manager.arrangeTab('moved', { kind: 'group', selector: '8' });
    expect(manager.byLabel('moved')).toMatchObject({ group: 8, groupName: 'group-8' });
    const monitorManager = setup([tab('active'), tab('monitor', 0, { view: 'monitor' })]);
    expect(monitorManager.arrangeTab('monitor', { kind: 'group', selector: 'Review' })).toBe(false);
  });

  it('can rearrange a hidden system tab when no center tab is active', () => {
    const system = tab('system', 1, { hidden: true, systemShell: true, view: 'plugin' });
    const docked = tab('files', 2, { view: 'files', dock: 'left' });
    const manager = setup([system, docked]);
    manager.activeTab = -1;

    expect(manager.arrangeTab('system', { kind: 'group', selector: 'background' })).toBe(true);
    expect(manager.byLabel('system')).toMatchObject({ hidden: true, groupName: 'background', group: 3 });
    expect(manager.activeTab).toBe(-1);
  });

  it('docks a hidden system plugin without revealing it or moving focus', () => {
    const manager = setup([
      tab('active'),
      tab('system', 1, { hidden: true, systemShell: true, view: 'plugin' }),
    ]);
    manager.arrangeTab('system', { kind: 'dock', side: 'left' });
    expect(manager.byLabel('system')).toMatchObject({ hidden: true, dock: 'left' });
    expect(manager.tabs[manager.activeTab]?.label).toBe('active');
  });
});

describe('TabManager.arrangeTab dock and undock', () => {
  it('docks plugin tabs, displaces focus only for an active target, and refuses unsupported kinds or the last center tab', () => {
    const activePlugin = tab('shell', 1, { view: 'plugin' });
    const manager = setup([activePlugin, tab('keeper')]);
    manager.arrangeTab('shell', { kind: 'dock', side: 'left' });
    expect(manager.byLabel('shell')?.dock).toBe('left');
    expect(manager.tabs[manager.activeTab]?.label).toBe('keeper');

    const nonActive = tab('files', 1, { view: 'files' });
    const nonActiveManager = setup([tab('active'), nonActive]);
    nonActiveManager.arrangeTab('files', { kind: 'dock', side: 'right' });
    expect(nonActiveManager.tabs[nonActiveManager.activeTab]?.label).toBe('active');

    const unsupported = setup([
      tab('active'),
      tab('harness', 1, { view: 'harness' }),
      tab('editor', 1, { view: 'editor' }),
      tab('monitor', 0, { view: 'monitor' }),
      tab('plain'),
    ]);
    for (const label of ['harness', 'editor', 'monitor', 'plain']) {
      expect(unsupported.arrangeTab(label, { kind: 'dock', side: 'left' })).toBe(false);
    }
    const last = setup([tab('only', 1, { view: 'plugin' })]);
    expect(last.arrangeTab('only', { kind: 'dock', side: 'left' })).toBe(false);
  });

  it('undocks into the focused pane without activation and activates the tab when no center tab is active', () => {
    const manager = setup([
      tab('left'), tab('active-right', 1, { pane: 'right' }), tab('docked', 2, { view: 'files', dock: 'left' }),
    ], 'active-right');
    manager.arrangeTab('docked', { kind: 'undock' });
    expect(manager.byLabel('docked')).toMatchObject({ dock: undefined, pane: 'right' });
    expect(manager.tabs[manager.activeTab]?.label).toBe('active-right');

    const hiddenSystem = tab('system', 1, { hidden: true, systemShell: true });
    const docked = tab('docked', 2, { view: 'files', dock: 'right' });
    const hiddenManager = setup([hiddenSystem, docked], 'system');
    hiddenManager.arrangeTab('docked', { kind: 'undock' });
    expect(hiddenManager.tabs[hiddenManager.activeTab]?.label).toBe('docked');
    expect(hiddenManager.byLabel('docked')?.dock).toBeUndefined();
    expect(hiddenManager.arrangeTab('system', { kind: 'undock' })).toBe(false);
  });
});

describe('TabManager.arrangeTab no-ops', () => {
  it('returns success without emitting a state update for completed changes', () => {
    const manager = setup([tab('janus'), tab('plugin', 1, { view: 'plugin', dock: 'left' })]);
    const dirty = vi.fn();
    const subscription = messageBus.on('state', 'dirty', dirty);
    for (const change of [
      { kind: 'move', position: 1 },
      { kind: 'pane', side: 'left' },
      { kind: 'color', color: '#123456' },
      { kind: 'group', selector: 'launch' },
      { kind: 'undock' },
    ] as const) {
      expect(manager.arrangeTab('janus', change)).toBe(true);
    }
    expect(manager.arrangeTab('plugin', { kind: 'dock', side: 'left' })).toBe(true);
    subscription.unsubscribe();
    expect(dirty).not.toHaveBeenCalled();
  });
});
