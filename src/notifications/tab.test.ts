import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from '../tab/manager.js';
import type { Managers } from '../managers.js';
import {
  openNotificationsTab, appendNotification, notificationsTab, revealNotificationsTab,
  notificationsFeedVisible, showNotificationsFeed, NOTIFICATIONS_LABEL,
} from './tab.js';
import { NotificationQueue, type RecordedNotification } from './queue.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.notifications = new NotificationQueue();
  managers.tab = new TabManager(managers);
  return managers;
}

function held(message: string): RecordedNotification {
  const at = new Date(2026, 0, 1, 20, 32, 0);
  return {
    event: 'manual',
    tabLabel: 'janus',
    message,
    entry: { input: '', output: message },
    detectedAt: at,
    recordedAt: at,
  };
}

describe('openNotificationsTab', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('creates exactly one notifications tab and reuses it on a second call', () => {
    openNotificationsTab(managers);
    expect(managers.tab.tabs.filter((t) => t.view === 'notifications')).toHaveLength(1);
    openNotificationsTab(managers);
    expect(managers.tab.tabs.filter((t) => t.view === 'notifications')).toHaveLength(1);
  });

  it('docks the tab into the requested sidebar when a dock argument is given', () => {
    openNotificationsTab(managers, 'right');
    expect(notificationsTab(managers)!.dock).toBe('right');
  });

  it('undocks an existing docked tab back to center when reopened bare', () => {
    openNotificationsTab(managers, 'left');
    openNotificationsTab(managers);
    expect(notificationsTab(managers)!.dock).toBeUndefined();
  });

  // The feed renders the queue, so a tab opened after the fact holds what came before it rather
  // than starting empty — the point of separating holding from rendering.
  it('seeds a newly created feed from the queue', () => {
    managers.notifications.append(held('one'));
    managers.notifications.append(held('two'));
    openNotificationsTab(managers);
    expect(notificationsTab(managers)!.log.map((e) => e.output)).toEqual(['one', 'two']);
  });

  it('does not re-seed a feed that is already open', () => {
    openNotificationsTab(managers);
    managers.notifications.append(held('one'));
    openNotificationsTab(managers);
    expect(notificationsTab(managers)!.log).toHaveLength(0);
  });
});

describe('notificationsFeedVisible', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('is false when no notifications tab exists', () => {
    expect(notificationsFeedVisible(managers)).toBe(false);
  });

  it.each(['left', 'right'] as const)('is false for a docked feed on the %s side until client selection', (dock) => {
    openNotificationsTab(managers, dock);
    expect(notificationsFeedVisible(managers)).toBe(false);
  });

  it('is true for a centre-strip feed that is the active tab', () => {
    openNotificationsTab(managers);
    expect(managers.tab.cur().label).toBe(NOTIFICATIONS_LABEL);
    expect(notificationsFeedVisible(managers)).toBe(true);
  });

  it('is false for a centre-strip feed sitting behind another tab', () => {
    openNotificationsTab(managers);
    managers.tab.setActiveTab(managers.tab.findIndex('janus'));
    expect(managers.tab.cur().label).not.toBe(NOTIFICATIONS_LABEL);
    expect(notificationsFeedVisible(managers)).toBe(false);
  });
});

describe('revealNotificationsTab', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('opens one feed docked into the right sidebar when none is open', () => {
    revealNotificationsTab(managers);
    expect(managers.tab.tabs.filter((t) => t.view === 'notifications')).toHaveLength(1);
    expect(notificationsTab(managers)!.dock).toBe('right');
  });

  // Creating a tab focuses it, and docking a focused tab moves focus to whatever sits nearest — so
  // without restoring it, an event firing in the background would move the user somewhere else.
  it('leaves the active tab where it was', () => {
    const before = managers.tab.cur().label;
    revealNotificationsTab(managers);
    expect(managers.tab.cur().label).toBe(before);
  });

  it('returns the open feed without creating a second one', () => {
    const existing = openNotificationsTab(managers);
    expect(revealNotificationsTab(managers)).toBe(existing);
    expect(managers.tab.tabs.filter((t) => t.view === 'notifications')).toHaveLength(1);
  });

  it.each([
    ['left' as const, 'left'],
    [undefined, undefined],
  ])('leaves a feed opened %s where the user put it', (dock, expected) => {
    openNotificationsTab(managers, dock);
    revealNotificationsTab(managers);
    expect(notificationsTab(managers)!.dock).toBe(expected);
  });
});

describe('showNotificationsFeed', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('opens a feed docked right when none exists', () => {
    showNotificationsFeed(managers);
    expect(notificationsTab(managers)!.dock).toBe('right');
  });

  it('leaves an already-docked feed exactly where it is', () => {
    openNotificationsTab(managers, 'left');
    showNotificationsFeed(managers);
    expect(notificationsTab(managers)!.dock).toBe('left');
  });

  // A hidden centre-strip feed is docked right rather than made active, so the user is not moved
  // out of the tab they were working in.
  it('docks a hidden centre-strip feed right and leaves the active tab alone', () => {
    openNotificationsTab(managers);
    managers.tab.setActiveTab(managers.tab.findIndex('janus'));
    const before = managers.tab.cur().label;
    showNotificationsFeed(managers);
    expect(notificationsTab(managers)!.dock).toBe('right');
    expect(managers.tab.cur().label).toBe(before);
    expect(notificationsFeedVisible(managers)).toBe(false);
  });
});

describe('appendNotification', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('appends a line when the notifications tab is open', () => {
    openNotificationsTab(managers);
    appendNotification(managers, { input: '', output: 'hello' });
    expect(notificationsTab(managers)!.log.some((e) => e.output === 'hello')).toBe(true);
  });

  it('is a no-op (creates nothing) when the notifications tab is closed', () => {
    const before = managers.tab.tabs.length;
    appendNotification(managers, { input: '', output: 'not mirrored' });
    expect(notificationsTab(managers)).toBeUndefined();
    expect(managers.tab.tabs).toHaveLength(before);
  });
});
