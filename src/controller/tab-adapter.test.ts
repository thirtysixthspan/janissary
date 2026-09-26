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
    pty: { input: vi.fn(), resizeOne: vi.fn(), kill: vi.fn(), resize: vi.fn() },
  } as unknown as Managers;
  // The fixture's own no-op would shadow the recorder, so the two are merged with the recorder last.
  Object.assign((managers.tab as Record<string, unknown>), { setActiveTab });
  return { managers, setActiveTab, moveTabToOtherPane, tabs };
}

describe('tab adapter focus', () => {
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
