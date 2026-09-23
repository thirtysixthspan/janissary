import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RecordedNotification } from './queue.js';
import {
  initNotificationRecord, appendNotificationRecord, clearNotificationRecord, notificationRecordPath,
} from './record.js';

const DETECTED = new Date(Date.UTC(2026, 0, 1, 20, 32, 0));

function notification(overrides: Partial<RecordedNotification> = {}): RecordedNotification {
  return {
    event: 'manual',
    tabLabel: 'janus',
    message: 'deploy finished',
    entry: { input: '', output: 'deploy finished' },
    detectedAt: DETECTED,
    recordedAt: DETECTED,
    ...overrides,
  };
}

function lines(): unknown[] {
  return readFileSync(notificationRecordPath(), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

describe('notification record', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'notification-record-'));
    initNotificationRecord(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    initNotificationRecord(undefined);
  });

  it('writes the file under .janissary', () => {
    expect(notificationRecordPath()).toBe(path.join(projectDir, '.janissary', 'notifications.json'));
  });

  it('appends one JSON line per notification, carrying the ISO time and the event type', () => {
    appendNotificationRecord(notification());
    expect(lines()).toEqual([{
      detectedAt: DETECTED.toISOString(),
      event: 'manual',
      tab: 'janus',
      message: 'deploy finished',
    }]);
  });

  it('carries the link targets when the event has them', () => {
    appendNotificationRecord(notification({ openFile: '/captures/a.txt', openTab: 'janus' }));
    expect(lines()[0]).toMatchObject({ openFile: '/captures/a.txt', openTab: 'janus' });
  });

  it('keeps one line per notification as they accumulate', () => {
    appendNotificationRecord(notification({ message: 'one' }));
    appendNotificationRecord(notification({ message: 'two' }));
    expect(lines()).toHaveLength(2);
  });

  it('empties the file on clear without removing it', () => {
    appendNotificationRecord(notification());
    clearNotificationRecord();
    expect(readFileSync(notificationRecordPath(), 'utf8')).toBe('');
  });

  // A write that cannot happen is swallowed and abandoned for the rest of the run: a notification
  // about failing to record notifications would itself need recording.
  it('swallows a failing write and stops attempting further ones', () => {
    rmSync(path.join(projectDir, '.janissary'), { recursive: true, force: true });
    expect(() => { appendNotificationRecord(notification()); }).not.toThrow();

    // The directory is back, but the run has already given up — nothing more is written until a
    // fresh `initNotificationRecord` re-arms it.
    mkdirSync(path.join(projectDir, '.janissary'), { recursive: true });
    appendNotificationRecord(notification({ message: 'after the failure' }));
    expect(existsSync(notificationRecordPath())).toBe(false);
  });

  it('is a no-op with no project directory', () => {
    initNotificationRecord(undefined);
    expect(notificationRecordPath()).toBe('');
    expect(() => { appendNotificationRecord(notification()); }).not.toThrow();
    expect(() => { clearNotificationRecord(); }).not.toThrow();
  });

  it('re-arms when a project directory is set again', () => {
    rmSync(path.join(projectDir, '.janissary'), { recursive: true, force: true });
    appendNotificationRecord(notification());

    initNotificationRecord(projectDir);
    appendNotificationRecord(notification({ message: 'after re-arm' }));
    expect(lines()).toHaveLength(1);
  });
});
