import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createController, type Controller } from '../controller.js';
import type { ClientMessage, TabView } from '../protocol.js';
import { handle } from '../message/handler.js';
import { seedRootTab, seedTestTab } from './root-tab-test-fixture.js';
import { tabRuntime } from './runtime.js';
import { spawnPty } from '../pty.js';
import { runTopicAction } from '../plugins/topics.js';
import { closePluginTabs } from '../plugins/teardown.js';
import { revealNotificationsTab, showNotificationsFeed } from '../notifications/tab.js';
import { MANAGER_TAB_RELEASE } from '../managers.js';
import { UNREAD_DWELL_MS } from './dwell.js';

vi.mock('../pty.js');

let controller: Controller;
let snapshots: { tabs: TabView[]; activeTab: number; secondaryTabLabel?: string }[];
const exit = vi.fn();
const notice = vi.fn();
const kill = vi.fn();
const replies = vi.fn();

beforeEach(() => {
  snapshots = [];
  vi.mocked(spawnPty).mockImplementation((program) => ({
    id: 'fixture-pty', program, write: vi.fn(), resize: vi.fn(), kill,
  }));
  controller = createController({
    emitState: () => { snapshots.push({
      tabs: controller.view(), activeTab: controller.managers.tab.activeTab,
      secondaryTabLabel: controller.managers.tab.secondaryTabLabel,
    }); },
    sendPty: vi.fn(), sendPtyExit: vi.fn(), exit, sendToast: notice,
  });
  seedRootTab(controller.managers.tab);
});

afterEach(async () => {
  await controller.shutdown();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function systemTab() {
  const manager = controller.managers.tab;
  const tab = seedTestTab(manager, 'system');
  tab.systemShell = true;
  tab.hasCommandQueue = true;
  tab.view = 'plugin';
  const reference = manager.registerFile('/fixture/system.txt').split('/').at(-1)!;
  const ptyId = controller.managers.pty.spawn(tab.label, 'fixture', 'fixture', manager.launchDir);
  tab.plugin = { id: 'fixture', instanceKey: 'system-instance', schemaVersion: 1, payload: { ptyId }, fileRefs: [reference], sourceLabel: 'janus' };
  tabRuntime(tab).queue.push('echo retained');
  controller.managers.schedule.add(tab.label, {
    id: 'retained', command: 'echo timer', spec: 'every 1h', nextRun: Date.now() + 3_600_000, recurring: true, intervalMs: 3_600_000,
  });
  snapshots.length = 0;
  return { manager, tab, reference, ptyId };
}

function rpc(message: Omit<ClientMessage, 'id'>) {
  handle(controller, { ...message, id: 'fixture' } as ClientMessage, replies);
}

describe('hidden lifecycle through real controller and RPC dispatch', () => {
  it('publishes the completed hide first and preserves all owned resources on repeated RPC close', () => {
    const { manager, tab, reference, ptyId } = systemTab();
    const runtime = tab.runtime;
    const payload = tab.plugin?.payload;
    const release = MANAGER_TAB_RELEASE.map((name) => vi.spyOn(controller.managers[name], 'closeTab'));
    const closeCaller = vi.spyOn(controller.managers.agent, 'closeCaller');
    const closeMonitor = vi.spyOn(controller.managers.agent, 'closeMonitor');
    const schedule = controller.managers.schedule.get('system');
    rpc({ method: 'closeTab', params: { label: 'system' } });
    expect(snapshots[0]).toMatchObject({ activeTab: 0, tabs: [{ label: 'janus', number: 1 }, { label: 'system', number: 2, hidden: true, systemShell: true }] });
    expect(manager.tabs[1]).toBe(tab);
    expect(tab.runtime).toBe(runtime);
    expect(tab.plugin?.payload).toBe(payload);
    expect(tab.runtime?.queue).toEqual(['echo retained']);
    expect(manager.openFilePath(reference)).toBe('/fixture/system.txt');
    expect(controller.managers.pty.isRunningFor(ptyId, ['system'])).toBe(true);
    expect(controller.managers.schedule.get('system')).toBe(schedule);
    rpc({ method: 'closeTab', params: { label: 'system' } });
    expect(snapshots).toHaveLength(1);
    for (const spy of release) expect(spy).not.toHaveBeenCalled();
    expect(closeCaller).not.toHaveBeenCalled();
    expect(closeMonitor).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
    expect(tab.log).toEqual([]);
  });

  it.each(['close', 'exit', 'close REVIEW NOTES', 'exit review notes'])('hides silently through the %s command', async (input) => {
    const { manager, tab } = systemTab();
    tab.title = 'review notes';
    controller.dispatch(input);
    await vi.waitFor(() => expect(tab.hidden).toBe(true));
    expect(manager.tabs).toHaveLength(2);
    expect(tab.log).toEqual([]);
    expect(kill).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
  });

  it('reveals a docked hidden target in the focused pane in its first snapshot, without changing indices', () => {
    const { manager } = systemTab();
    const right = seedTestTab(manager, 'right');
    const tab = manager.byLabel('system')!;
    right.pane = 'right';
    manager.secondaryTabLabel = 'janus';
    tab.hidden = true;
    tab.dock = 'left';
    snapshots.length = 0;
    rpc({ method: 'setActiveTab', params: { index: 1 } });
    expect(snapshots[0]).toMatchObject({ activeTab: 1, secondaryTabLabel: 'janus' });
    expect(snapshots[0].tabs.map((entry) => entry.label)).toEqual(['janus', 'system', 'right']);
    expect(snapshots[0].tabs[1]).toMatchObject({ systemShell: true, pane: 'right' });
    expect(snapshots[0].tabs[1].hidden).toBeUndefined();
    expect(snapshots[0].tabs[1].dock).toBeUndefined();
    expect(snapshots).toHaveLength(1);
  });

  it('preserves an unaffected primary selection and repairs a hidden secondary before broadcasting', () => {
    const { manager, tab: original } = systemTab();
    const right = seedTestTab(manager, 'right');
    const tab = manager.byLabel(original.label)!;
    manager.tabs[0].pane = undefined;
    right.pane = 'right';
    manager.activeTab = 0;
    manager.secondaryTabLabel = tab.label;
    tab.pane = 'right';
    snapshots.length = 0;

    manager.userCloseTab(manager.tabs.indexOf(tab));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ activeTab: 0, secondaryTabLabel: 'right' });
    expect(snapshots[0].tabs[1]).toMatchObject({ hidden: true, systemShell: true });
    expect(snapshots[0].tabs[2].hidden).toBeUndefined();
  });

  it('refuses the reserved user alias and lets a managed shell clear to its canonical label', () => {
    const { manager } = systemTab();
    const root = manager.tabs[0];
    expect(manager.renameTab(0, '  SYSTEM  ')).toBe('Cannot use "system": that name is reserved for the system tab.');
    expect(root.title).toBeUndefined();
    const system = manager.byLabel('system')!;
    system.title = 'review notes';
    expect(manager.renameTab(manager.findIndex('system'), 'system')).toBeUndefined();
    expect(system.title).toBeUndefined();
  });

  it('routes a reserved editor rename RPC through file-operation notification without touching its path', () => {
    const { manager } = systemTab();
    const tab = manager.tabs[0]!;
    tab.view = 'editor';
    tab.editor = { name: 'notes.md', path: '/fixture/notes.md', size: '1 B', url: '/open/notes' };
    const notification = vi.spyOn(controller.managers.notifications, 'append');
    rpc({ method: 'renameTab', params: { index: 0, title: ' SyStEm ' } });

    expect(tab.editor).toEqual({ name: 'notes.md', path: '/fixture/notes.md', size: '1 B', url: '/open/notes' });
    expect(notification).toHaveBeenCalledOnce();
    expect(notification.mock.calls[0]?.[0].message).toContain('Cannot use "system": that name is reserved for the system tab.');
  });

  it('uses exact-label focus RPC, ignoring missing labels and invalid indices before mutation', () => {
    const { manager, tab } = systemTab();
    manager.userCloseTab(1);
    snapshots.length = 0;
    for (const index of [-1, 10, 0.5, NaN]) rpc({ method: 'setActiveTab', params: { index } });
    for (const label of ['SYSTEM', 'missing']) rpc({ method: 'focusTab', params: { label } });
    expect(tab.hidden).toBe(true);
    expect(snapshots).toEqual([]);
    rpc({ method: 'focusTab', params: { label: 'system' } });
    expect(snapshots[0].activeTab).toBe(1);
    expect(snapshots[0].tabs[1].hidden).toBeUndefined();
  });

  it('cycles over a hidden tab without revealing it and keeps full-array numbering', () => {
    const { manager } = systemTab();
    seedTestTab(manager, 'other');
    const hidden = manager.byLabel('system')!;
    hidden.hidden = true;
    manager.activeTab = manager.findIndex('janus');
    snapshots.length = 0;

    manager.moveTab(1);

    expect(manager.tabs[manager.activeTab]?.label).toBe('other');
    expect(manager.tabs.map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(snapshots[0]?.tabs[1]).toMatchObject({ hidden: true, systemShell: true, number: 2 });
    expect(hidden.hidden).toBe(true);
  });

  it('reveals only an authorized schedule owner and keeps its timer and queue', () => {
    const { manager, tab } = systemTab();
    manager.userCloseTab(1);
    runTopicAction(controller.managers, { topic: 'schedules', action: 'focusOwner', tab: 'janus' });
    expect(tab.hidden).toBe(true);
    snapshots.length = 0;
    runTopicAction(controller.managers, { topic: 'schedules', action: 'focusOwner', tab: 'system' });
    expect(snapshots[0].activeTab).toBe(1);
    expect(snapshots[0].tabs[1]).toMatchObject({ systemShell: true, commandQueue: ['echo retained'] });
    expect(controller.managers.schedule.get('system')).toHaveLength(1);
  });

  it('restores a surviving history label after lower-index destructive removal without revealing hidden history', async () => {
    const { manager, tab } = systemTab();
    manager.userCloseTab(1);
    seedTestTab(manager, 'third');
    seedTestTab(manager, 'fourth');
    manager.activeTab = 0;
    manager.focusHistory = ['third', 'system', 'missing'];
    await manager.closeTab(0);
    expect(manager.tabs.map((entry) => entry.label)).toEqual(['system', 'third', 'fourth']);
    expect(manager.tabs[manager.activeTab].label).toBe('third');
    expect(manager.byLabel('system')?.hidden).toBe(true);
    expect(tab.runtime?.queue).toEqual(['echo retained']);
  });

  it('keeps an empty center unselected during background notification creation and docking', () => {
    const { manager, tab } = systemTab();
    manager.setDock(0, 'left');
    manager.userCloseTab(1);
    expect(manager.activeTab).toBe(-1);
    expect(manager.secondaryTabLabel).toBeUndefined();
    revealNotificationsTab(controller.managers);
    expect(manager.activeTab).toBe(-1);
    showNotificationsFeed(controller.managers);
    expect(manager.activeTab).toBe(-1);
    expect(tab.hidden).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it('cancels dwell when hiding empties the center and passive operations never reveal it', () => {
    vi.useFakeTimers();
    const { manager, tab } = systemTab();
    manager.setDock(0, 'left');
    tab.hasUnread = true;
    manager.setActiveTab(1);
    manager.userCloseTab(1);
    manager.repairSelections();
    manager.moveTab(1);
    manager.moveTab(-1);
    manager.reorderTabTo(1, 0);
    vi.advanceTimersByTime(UNREAD_DWELL_MS);
    expect(manager.activeTab).toBe(-1);
    expect(tab.hasUnread).toBe(true);
    expect(tab.hidden).toBe(true);
  });

  it('destructive close still releases a hidden system tab and its resources', async () => {
    const { manager, reference, ptyId } = systemTab();
    manager.userCloseTab(1);
    await manager.closeTab(1);
    expect(manager.byLabel('system')).toBeUndefined();
    expect(manager.openFilePath(reference)).toBeUndefined();
    expect(controller.managers.schedule.get('system')).toBeUndefined();
    expect(controller.managers.pty.isRunning(ptyId)).toBe(false);
    expect(kill).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([true, false])('plugin disable recovers with a hidden=%s system-only survivor and destroys owned tabs', (hidden) => {
    const { manager, tab, reference } = systemTab();
    tab.plugin!.id = 'failed';
    tab.hidden = true;
    const root = manager.tabs[0];
    root.systemShell = true;
    root.hidden = hidden ? true : undefined;
    closePluginTabs(controller.managers, 'failed');
    expect(manager.byLabel('system')).toBeUndefined();
    expect(manager.openFilePath(reference)).toBeUndefined();
    expect(manager.cur().view).toBe('notifications');
    expect(manager.byLabel('janus')?.hidden).toBe(hidden ? true : undefined);
    expect(exit).not.toHaveBeenCalled();
  });

  it('shutdown releases retained PTYs after user hide', async () => {
    const { manager } = systemTab();
    manager.userCloseTab(1);
    await controller.shutdown();
    expect(kill).toHaveBeenCalledOnce();
  });
});
