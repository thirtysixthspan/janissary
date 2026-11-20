import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NotificationConfig } from '../config.js';
import { NOTIFICATION_ALERT_DEFAULTS } from './alert-defaults.js';
import {
  DEFAULT_NOTIFICATION_CONFIG, getNotificationConfig, loadNotificationConfig, saveNotificationConfig,
} from './config.js';

describe('notification config', () => {
  let projectDir: string;
  let stateDir: string;
  let filePath: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'notification-config-'));
    stateDir = path.join(projectDir, '.janissary');
    filePath = path.join(stateDir, 'notifications.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates a fresh file with every default listed alphabetically', () => {
    const config = loadNotificationConfig(projectDir);
    expect(config.events).toEqual(DEFAULT_NOTIFICATION_CONFIG.events);
    expect(config.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(raw.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
    expect(Object.keys(raw.alerts)).toEqual(Object.keys(NOTIFICATION_ALERT_DEFAULTS).toSorted((a, b) => a.localeCompare(b)));
    expect(getNotificationConfig()).toBe(config);
  });

  it('seeds the file from a legacy notifications section', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({
      notifications: { events: { stateChange: true }, alerts: null },
    }));
    const config = loadNotificationConfig(projectDir);
    expect(config.events.stateChange).toBe(true);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(raw.events.stateChange).toBe(true);
    expect(raw.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('warns on invalid JSON, uses defaults, and leaves the file untouched', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, 'not-json');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = loadNotificationConfig(projectDir);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/notifications.json is invalid JSON — using defaults (file left untouched)'),
    );
    expect(config.events).toEqual(DEFAULT_NOTIFICATION_CONFIG.events);
    expect(readFileSync(filePath, 'utf8')).toBe('not-json');
  });

  it('decodes toggles and alerts field by field, dropping unknown and malformed entries', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({
      events: { stateChange: 'yes', systemScheduleFire: false },
      alerts: {
        question: { desktop: false, sound: 'error' },
        manual: { sound: 'none' },
        'file-operation': { desktop: true, sound: 'loud' },
        'state-change': 'invalid',
        unknown: { desktop: true, sound: 'success' },
      },
    }));
    const config = loadNotificationConfig(projectDir);
    expect(config.events.stateChange).toBe(false);
    expect(config.events.systemScheduleFire).toBe(false);
    expect(config.events.modelsRefresh).toBe(true);
    expect(config.alerts.question).toEqual({ desktop: false, sound: 'error' });
    expect(config.alerts.manual).toEqual({ desktop: true, sound: 'none' });
    expect(config.alerts['file-operation']).toEqual({ desktop: true, sound: 'error' });
    expect(config.alerts['state-change']).toEqual(NOTIFICATION_ALERT_DEFAULTS['state-change']);
    expect(config.alerts).not.toHaveProperty('unknown');
  });

  it('backfills a missing alerts map onto disk while keeping unknown keys', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ events: { stateChange: true }, custom: 'kept' }));
    const config = loadNotificationConfig(projectDir);
    expect(config.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(raw.events).toEqual({ stateChange: true });
    expect(raw.custom).toBe('kept');
    expect(raw.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('fills only individual missing alert types', () => {
    mkdirSync(stateDir, { recursive: true });
    const partial = { ...NOTIFICATION_ALERT_DEFAULTS, 'agent-start': { desktop: 'bad', custom: true } };
    delete partial.question;
    delete partial['state-change'];
    writeFileSync(filePath, JSON.stringify({ alerts: partial }));
    loadNotificationConfig(projectDir);
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(raw.alerts['agent-start']).toEqual(partial['agent-start']);
    expect(raw.alerts.question).toEqual(NOTIFICATION_ALERT_DEFAULTS.question);
    expect(raw.alerts['state-change']).toEqual(NOTIFICATION_ALERT_DEFAULTS['state-change']);
    expect(Object.keys(raw.alerts)).toHaveLength(Object.keys(NOTIFICATION_ALERT_DEFAULTS).length);
  });

  it('replaces a non-object alerts value with the full map', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ alerts: 'off' }));
    expect(loadNotificationConfig(projectDir).alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('leaves a complete file byte-for-byte untouched', () => {
    mkdirSync(stateDir, { recursive: true });
    const complete = JSON.stringify(DEFAULT_NOTIFICATION_CONFIG, undefined, 2) + '\n';
    writeFileSync(filePath, complete);
    loadNotificationConfig(projectDir);
    expect(readFileSync(filePath, 'utf8')).toBe(complete);
  });

  it('stays silent when a backfill cannot be written', () => {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ events: {} }));
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    chmodSync(stateDir, 0o500);
    try {
      expect(loadNotificationConfig(projectDir).alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      chmodSync(stateDir, 0o700);
    }
  });

  it('saves a full config and round-trips it through a reload', () => {
    loadNotificationConfig(projectDir);
    const next: NotificationConfig = {
      events: { ...DEFAULT_NOTIFICATION_CONFIG.events, stateChange: true, systemScheduleFire: false },
      alerts: { ...DEFAULT_NOTIFICATION_CONFIG.alerts, question: { desktop: false, sound: 'error' } },
    };
    expect(saveNotificationConfig(next)).toBe(true);
    expect(getNotificationConfig()).toEqual(next);
    expect(loadNotificationConfig(projectDir)).toEqual(next);
  });
});
