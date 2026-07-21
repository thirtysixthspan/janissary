import { describe, it, expect } from 'vitest';
import { openProfileNotifications } from './notifications.js';
import { notificationsTab } from '../notifications-tab.js';
import { TabManager } from '../tab/manager.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { ProfileNotificationsEntry } from '../types.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('openProfileNotifications', () => {
  it('opens a docked notifications tab and records the docked note', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileNotifications([{ dock: 'right' }], managers, notes);

    expect(notificationsTab(managers)!.dock).toBe('right');
    expect(notes).toEqual(['Opened notifications (docked right).']);
  });

  it('opens an undocked notifications tab and records the plain note', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileNotifications([{}], managers, notes);

    expect(notificationsTab(managers)!.dock).toBeUndefined();
    expect(notes).toEqual(['Opened notifications.']);
  });

  it('emits a layout focus event when docked with focus: true', () => {
    const managers = makeManagers();
    const events: unknown[] = [];
    const sub = messageBus.on('layout', 'update', (event) => { events.push(event); });

    try {
      openProfileNotifications([{ dock: 'right', focus: true }], managers, []);
    } finally {
      sub.unsubscribe();
    }

    expect(events).toEqual([{ type: 'update', focusRight: 'notifications' }]);
  });

  it('does not emit a layout focus event when focus is omitted', () => {
    const managers = makeManagers();
    const events: unknown[] = [];
    const sub = messageBus.on('layout', 'update', (event) => { events.push(event); });

    try {
      openProfileNotifications([{ dock: 'right' }], managers, []);
    } finally {
      sub.unsubscribe();
    }

    expect(events).toEqual([]);
  });

  it('does nothing when there are no notifications entries', () => {
    const managers = makeManagers();
    const notes: string[] = [];
    const empty: ProfileNotificationsEntry[] = [];

    openProfileNotifications(empty, managers, notes);

    expect(notificationsTab(managers)).toBeUndefined();
    expect(notes).toEqual([]);
  });
});
