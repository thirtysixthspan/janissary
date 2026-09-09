import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from './tab/manager.js';
import type { Managers } from './managers.js';
import {
  openNotificationsTab, appendNotification, notificationsTab, revealNotificationsTab,
} from './notifications-tab.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
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
    appendNotification(managers, { input: '', output: 'dropped' });
    expect(notificationsTab(managers)).toBeUndefined();
    expect(managers.tab.tabs).toHaveLength(before);
  });
});
