import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProfileNotifications } from './notifications.js';
import { notificationsTab } from '../notifications-tab.js';
import { initProfileDir } from '../profiles.js';
import { TabManager } from '../tab/manager.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  return managers;
}

describe('openProfileNotifications', () => {
  let root: string;

  const writeNotifications = (profile: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '_notifications.json'), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profnotif-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('opens a docked notifications tab and records the docked note', () => {
    writeNotifications('claude', JSON.stringify([{ dock: 'right' }]));
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileNotifications('claude', managers, notes);

    expect(notificationsTab(managers)!.dock).toBe('right');
    expect(notes).toEqual(['Opened notifications (docked right).']);
  });

  it('opens an undocked notifications tab and records the plain note', () => {
    writeNotifications('claude', JSON.stringify([{}]));
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileNotifications('claude', managers, notes);

    expect(notificationsTab(managers)!.dock).toBeUndefined();
    expect(notes).toEqual(['Opened notifications.']);
  });

  it('emits a layout focus event when docked with focus: true', () => {
    writeNotifications('claude', JSON.stringify([{ dock: 'right', focus: true }]));
    const managers = makeManagers();
    const notes: string[] = [];
    const events: unknown[] = [];
    const sub = messageBus.on('layout', 'update', (event) => { events.push(event); });

    try {
      openProfileNotifications('claude', managers, notes);
    } finally {
      sub.unsubscribe();
    }

    expect(events).toEqual([{ type: 'update', focusRight: 'notifications' }]);
  });

  it('does not emit a layout focus event when focus is omitted', () => {
    writeNotifications('claude', JSON.stringify([{ dock: 'right' }]));
    const managers = makeManagers();
    const notes: string[] = [];
    const events: unknown[] = [];
    const sub = messageBus.on('layout', 'update', (event) => { events.push(event); });

    try {
      openProfileNotifications('claude', managers, notes);
    } finally {
      sub.unsubscribe();
    }

    expect(events).toEqual([]);
  });

  it('does nothing when the profile has no _notifications.json', () => {
    const managers = makeManagers();
    const notes: string[] = [];

    openProfileNotifications('claude', managers, notes);

    expect(notificationsTab(managers)).toBeUndefined();
    expect(notes).toEqual([]);
  });
});
