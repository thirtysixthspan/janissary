import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

  it('does not append through a symlink at the record path', () => {
    const target = path.join(projectDir, 'outside.txt');
    writeFileSync(target, 'keep this');
    appendNotificationRecord(notification());
    rmSync(notificationRecordPath());
    symlinkSync(target, notificationRecordPath());

    appendNotificationRecord(notification());

    expect(readFileSync(target, 'utf8')).toBe('keep this');
  });

  it('does not truncate through a symlink at the record path', () => {
    const target = path.join(projectDir, 'outside.txt');
    writeFileSync(target, 'keep this');
    appendNotificationRecord(notification());
    rmSync(notificationRecordPath());
    symlinkSync(target, notificationRecordPath());

    clearNotificationRecord();

    expect(readFileSync(target, 'utf8')).toBe('keep this');
  });

  it('does not hang when a FIFO sits at the record path', () => {
    execFileSync('mkfifo', [notificationRecordPath()]);

    expect(() => { appendNotificationRecord(notification()); }).not.toThrow();
    expect(() => { clearNotificationRecord(); }).not.toThrow();

    expect(lstatSync(notificationRecordPath()).isFIFO()).toBe(true);
  });

  it('does not initialize the record through a symlinked state directory', () => {
    const stateDir = path.join(projectDir, '.janissary');
    const targetDir = path.join(projectDir, 'outside');
    mkdirSync(targetDir);
    writeFileSync(path.join(targetDir, 'notifications.json'), 'keep this');
    rmSync(stateDir, { recursive: true });
    symlinkSync(targetDir, stateDir);

    initNotificationRecord(projectDir);
    appendNotificationRecord(notification());
    clearNotificationRecord();

    expect(readFileSync(path.join(targetDir, 'notifications.json'), 'utf8')).toBe('keep this');
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
