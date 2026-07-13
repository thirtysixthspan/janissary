import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from './tab/manager.js';
import type { Managers } from './managers.js';
import { openNotificationsTab, appendNotification, notificationsTab } from './notifications-tab.js';

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
