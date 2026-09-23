import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TabManager } from '../tab/manager.js';
import { flattenBuffer } from '../tab/formatting.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { appendNotification, notificationsTab, openNotificationsTab } from '../notifications/tab.js';
import { NotificationQueue, type RecordedNotification } from '../notifications/queue.js';
import {
  appendNotificationRecord, initNotificationRecord, notificationRecordPath,
} from '../notifications/record.js';
import { command } from './notifications.js';

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

const issuer = { label: 'janus', index: 0 };

describe('notifications command', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('opens the feed', () => {
    command.run('notifications', issuer, managers);
    expect(notificationsTab(managers)).toBeDefined();
  });

  it.each(['left', 'right'] as const)('docks the feed %s', (dock) => {
    command.run(`notifications ${dock}`, issuer, managers);
    expect(notificationsTab(managers)!.dock).toBe(dock);
  });

  it('records the command as a transcript entry in the issuing tab', () => {
    command.run('notifications', issuer, managers);
    expect(managers.tab.tabs.find((t) => t.label === 'janus')!.log.map((e) => e.input))
      .toContain('notifications');
  });
});

describe('notifications clear', () => {
  let managers: Managers;
  let projectDir: string;
  let clears: number;
  let stateChanges: number;
  let subscription: { unsubscribe: () => void };
  let stateSubscription: { unsubscribe: () => void };

  beforeEach(() => {
    managers = makeManagers();
    projectDir = mkdtempSync(path.join(tmpdir(), 'notifications-clear-'));
    initNotificationRecord(projectDir);
    clears = 0;
    stateChanges = 0;
    subscription = messageBus.on('notifications', 'clear', () => { clears += 1; });
    stateSubscription = messageBus.on('state', 'dirty', () => { stateChanges += 1; });
  });

  afterEach(() => {
    subscription.unsubscribe();
    stateSubscription.unsubscribe();
    initNotificationRecord(undefined);
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('empties the queue, the record file, and the corner', () => {
    managers.notifications.append(held('one'));
    appendNotificationRecord(held('one'));
    command.run('notifications clear', issuer, managers);
    expect(managers.notifications.all).toHaveLength(0);
    expect(readFileSync(notificationRecordPath(), 'utf8')).toBe('');
    expect(clears).toBe(1);
  });

  it('opens nothing', () => {
    command.run('notifications clear', issuer, managers);
    expect(notificationsTab(managers)).toBeUndefined();
  });

  it('works with a feed already open, leaving it empty', () => {
    managers.notifications.append(held('one'));
    openNotificationsTab(managers);
    command.run('notifications clear', issuer, managers);
    expect(managers.notifications.all).toHaveLength(0);
    expect(notificationsTab(managers)).toBeDefined();
    expect(notificationsTab(managers)!.log).toEqual([]);
    expect(flattenBuffer(notificationsTab(managers)!.log)).toEqual([]);
    expect(stateChanges).toBeGreaterThan(0);

    const later = held('later');
    managers.notifications.append(later);
    appendNotification(managers, later.entry);
    expect(notificationsTab(managers)!.log.map((entry) => entry.output)).toEqual(['later']);
    expect(flattenBuffer(notificationsTab(managers)!.log)).toHaveLength(1);
  });

  it('records the command as a transcript entry in the issuing tab', () => {
    command.run('notifications clear', issuer, managers);
    expect(managers.tab.tabs.find((t) => t.label === 'janus')!.log.map((e) => e.input))
      .toContain('notifications clear');
  });

  // `clear` names an action rather than a placement, and the command keeps its single-keyword
  // parse, so a dock keyword ahead of it wins and nothing is cleared.
  it('is ignored after a dock keyword', () => {
    managers.notifications.append(held('one'));
    command.run('notifications right clear', issuer, managers);
    expect(notificationsTab(managers)!.dock).toBe('right');
    expect(managers.notifications.all).toHaveLength(1);
  });
});
