import { describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { createTabControllerAdapter } from './tab-adapter.js';
import { NOTIFICATIONS_LABEL } from '../notifications/tab.js';
import { NotificationQueue } from '../notifications/queue.js';
import { fakeNotificationsHost } from '../notifications/tab-test-fixture.js';
import type { Managers } from '../managers.js';

function makeManagers(labels: string[] = ['agent']) {
  // The feed is recognized by its `view`, not its label, so a stand-in has to carry it too.
  const tabs = labels.map((label) => ({
    label, log: [], ...(label === NOTIFICATIONS_LABEL && { view: 'notifications' }),
  }));
  const active = tabs[0];
  const setActiveTab = vi.fn((index: number) => { active.label = tabs[index]?.label ?? active.label; });
  const moveTabToOtherPane = vi.fn();
  const managers = {
    tab: {
      tabs,
      cur: () => tabs[0],
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
      setActiveTab,
      moveTabToOtherPane,
      ...fakeNotificationsHost(tabs),
    },
    notifications: new NotificationQueue(),
    shell: { promoteRunning: vi.fn() },
    pty: { input: vi.fn(), resizeOne: vi.fn(), kill: vi.fn(), resize: vi.fn(), isRunningFor: vi.fn((id, labels) => id === 'pty1' && labels.includes('owner')) },
  } as unknown as Managers;
  // The fixture's own no-op would shadow the recorder, so the two are merged with the recorder last.
  Object.assign((managers.tab as Record<string, unknown>), { setActiveTab });
  return { managers, setActiveTab, moveTabToOtherPane, tabs };
}

describe('tab adapter focus', () => {
  it('authorizes attachment only for the tab that owns the terminal', () => {
    const { managers } = makeManagers();
    const adapter = createTabControllerAdapter(managers);
    expect(adapter.pluginTerminalAttach('pty1', 'owner')).toBe(true);
    expect(adapter.pluginTerminalAttach('pty2', 'owner')).toBe(false);
  });

  it('ignores plugin input and resize for a terminal owned by another tab', () => {
    const { managers } = makeManagers();
    const adapter = createTabControllerAdapter(managers);
    adapter.ptyInput('pty2', 'intrusion', 'owner');
    adapter.ptyResize('pty2', 120, 40, 'owner');
    expect(managers.pty.input).not.toHaveBeenCalled();
    expect(managers.pty.resizeOne).not.toHaveBeenCalled();
  });

  it('forwards plugin input and resize for its own terminal', () => {
    const { managers } = makeManagers();
    const adapter = createTabControllerAdapter(managers);
    adapter.ptyInput('pty1', 'owned input', 'owner');
    adapter.ptyResize('pty1', 100, 32, 'owner');
    expect(managers.pty.input).toHaveBeenCalledWith('pty1', 'owned input');
    expect(managers.pty.resizeOne).toHaveBeenCalledWith('pty1', 100, 32);
  });

  // Addressing a tab by label has to go through the index the tab manager holds, or a rename or a
  // close would leave the client focusing a position rather than the tab it named.
  it('focusTab activates the index the label resolves to', () => {
    const { managers, setActiveTab, tabs } = makeManagers(['agent', 'other']);
    createTabControllerAdapter(managers).focusTab('other');
    expect(setActiveTab).toHaveBeenCalledWith(1);
    expect(tabs[0].label).toBe('other');
  });

  // A label no open tab carries resolves to -1, which the tab manager treats as "nothing to
  // activate" — so the RPC answers without moving focus rather than activating index -1.
  it('focusTab activates nothing for a label no open tab carries', () => {
    const { managers, setActiveTab } = makeManagers(['agent']);
    createTabControllerAdapter(managers).focusTab('gone');
    expect(setActiveTab).toHaveBeenCalledWith(-1);
  });

  it('moveTabToOtherPane forwards the index to the tab manager', () => {
    const { managers, moveTabToOtherPane } = makeManagers();
    createTabControllerAdapter(managers).moveTabToOtherPane(3);
    expect(moveTabToOtherPane).toHaveBeenCalledWith(3);
  });
});

describe('tab adapter notifications', () => {
  // Revealing the feed is an escalation, not just an open: it docks the feed and clears the corner,
  // so both have to happen together or the user docks a feed still showing a badge for what they
  // just opened.
  it('revealNotifications docks the feed and clears the corner', () => {
    const { managers, tabs } = makeManagers();
    const seen: unknown[] = [];
    const subscription = messageBus.on('notifications', ['reveal', 'clear'], (event) => { seen.push(event); });

    createTabControllerAdapter(managers).revealNotifications();
    subscription.unsubscribe();

    expect(seen).toEqual([{ type: 'reveal', dock: 'right' }, { type: 'clear' }]);
    const feed = tabs.find((tab) => tab.label === NOTIFICATIONS_LABEL);
    expect(feed?.dock).toBe('right');
  });

  it('revealNotifications reuses the feed already open rather than opening a second one', () => {
    const { managers, tabs } = makeManagers(['agent', NOTIFICATIONS_LABEL]);
    createTabControllerAdapter(managers).revealNotifications();
    expect(tabs.filter((tab) => tab.label === NOTIFICATIONS_LABEL)).toHaveLength(1);
  });
});

describe('tab adapter command queue', () => {
  function withQueueEdits() {
    const { managers } = makeManagers(['agent', 'shell1']);
    const editQueued = vi.fn();
    const deleteQueued = vi.fn();
    Object.assign((managers.tab as Record<string, unknown>), { editQueued, deleteQueued });
    return { adapter: createTabControllerAdapter(managers), editQueued, deleteQueued };
  }

  // A queue popup open over a docked shell edits that shell's queue while an agent is the active tab.
  it('edits and deletes in the named tab\'s queue', () => {
    const { adapter, editQueued, deleteQueued } = withQueueEdits();
    adapter.editQueuedCommand(1, 'ls', 'shell1');
    adapter.deleteQueuedCommand(0, 'shell1');
    expect(editQueued).toHaveBeenCalledWith('shell1', 1, 'ls');
    expect(deleteQueued).toHaveBeenCalledWith('shell1', 0);
  });

  it('edits and deletes in the active tab\'s queue when no tab is named', () => {
    const { adapter, editQueued, deleteQueued } = withQueueEdits();
    adapter.editQueuedCommand(0, 'pwd');
    adapter.deleteQueuedCommand(2);
    expect(editQueued).toHaveBeenCalledWith('agent', 0, 'pwd');
    expect(deleteQueued).toHaveBeenCalledWith('agent', 2);
  });
});
