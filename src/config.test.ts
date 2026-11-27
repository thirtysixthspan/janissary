import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, chmodSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import {
  loadConfig, getConfig, updateConfig, DEFAULT_TRANSCRIPT_MAX_LINES, DEFAULT_LOG_RETENTION_IN_DAYS,
} from './config.js';
import {
  DEFAULT_TAB_NAME_MAX_LENGTH, DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES,
} from './shared/config-defaults.js';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';
import { DEFAULT_APP_THEME } from './app-themes.js';
import { NOTIFICATION_ALERT_DEFAULTS } from './notifications/alert-defaults.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a default config.json when none exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
    expect(config.tabNameMaxLength).toBe(DEFAULT_TAB_NAME_MAX_LENGTH);
    expect(config.activeTabNameMaxLength).toBe(DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH);
    expect(config.syntaxTheme).toBe(DEFAULT_SYNTAX_THEME);
    expect(config.theme).toBe(DEFAULT_APP_THEME);

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
    expect(parsed.tabNameMaxLength).toBe(DEFAULT_TAB_NAME_MAX_LENGTH);
    expect(parsed.activeTabNameMaxLength).toBe(DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH);
    expect(parsed.syntaxTheme).toBe(DEFAULT_SYNTAX_THEME);
    expect(parsed.theme).toBe(DEFAULT_APP_THEME);
  });

  it('reads custom tab name display limits from an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ tabNameMaxLength: 8, activeTabNameMaxLength: 40 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.tabNameMaxLength).toBe(8);
    expect(config.activeTabNameMaxLength).toBe(40);
  });

  it('reads an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(100);
  });

  it('writes the default max tool turns into a fresh config', () => {
    const config = loadConfig(tmpDir);
    expect(config.maxToolTurns).toBe(20);

    const parsed = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8'));
    expect(parsed.maxToolTurns).toBe(20);
  });

  it('writes both harness log settings into a fresh config', () => {
    const config = loadConfig(tmpDir);
    expect(config.logEnabled).toBe(true);
    expect(config.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);

    const parsed = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8'));
    expect(parsed.logEnabled).toBe(true);
    expect(parsed.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
  });

  it('backfills max tool turns into an existing config that predates it', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ transcriptMaxLines: 100, custom: 'kept' }));

    const config = loadConfig(tmpDir);

    expect(config.maxToolTurns).toBe(20);
    expect(config.transcriptMaxLines).toBe(100);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.maxToolTurns).toBe(20);
    expect(written.transcriptMaxLines).toBe(100);
    expect(written.custom).toBe('kept');
  });

  it('backfills both harness log settings into an existing config that predates them', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ maxToolTurns: 42, transcriptMaxLines: 100, custom: 'kept' }));

    const config = loadConfig(tmpDir);

    expect(config.logEnabled).toBe(true);
    expect(config.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.logEnabled).toBe(true);
    expect(written.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
    expect(written.maxToolTurns).toBe(42);
    expect(written.transcriptMaxLines).toBe(100);
    expect(written.custom).toBe('kept');
  });

  it('backfills only logRetentionInDays when logEnabled is already present', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ maxToolTurns: 20, logEnabled: false }));

    const config = loadConfig(tmpDir);

    expect(config.logEnabled).toBe(false);
    expect(config.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.logEnabled).toBe(false);
    expect(written.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
  });

  it('honors an explicit max tool turns and does not rewrite the file', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    const raw = JSON.stringify({ maxToolTurns: 42, logEnabled: false, logRetentionInDays: 3 });
    writeFileSync(configPath, raw);

    expect(loadConfig(tmpDir).maxToolTurns).toBe(42);
    expect(readFileSync(configPath, 'utf8')).toBe(raw);
  });

  it.each([0, -3, 2.5, '20', null])(
    'falls back to 20 for the invalid max tool turns %p while keeping valid neighbors',
    (value) => {
      const configDir = path.join(tmpDir, '.janissary');
      mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.json');
      writeFileSync(configPath, JSON.stringify({ maxToolTurns: value, transcriptMaxLines: 100 }));

      const config = loadConfig(tmpDir);

      expect(config.maxToolTurns).toBe(20);
      expect(config.transcriptMaxLines).toBe(100);
      expect(JSON.parse(readFileSync(configPath, 'utf8')).maxToolTurns).toBe(value);
    },
  );

  it.each([
    [0, 0],
    [3, 3],
    [-1, 7],
    [1.5, 7],
    ['7', 7],
  ])('decodes logRetentionInDays %p to %p', (value, expected) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    const raw = JSON.stringify({ maxToolTurns: 20, logEnabled: true, logRetentionInDays: value });
    writeFileSync(configPath, raw);

    expect(loadConfig(tmpDir).logRetentionInDays).toBe(expected);
    expect(readFileSync(configPath, 'utf8')).toBe(raw);
  });

  it('honors an explicit false logEnabled', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ maxToolTurns: 20, logEnabled: false, logRetentionInDays: 7 }),
    );

    expect(loadConfig(tmpDir).logEnabled).toBe(false);
  });

  it('falls back to true for a non-boolean logEnabled', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ maxToolTurns: 20, logEnabled: 'false', logRetentionInDays: 7 }),
    );

    expect(loadConfig(tmpDir).logEnabled).toBe(true);
  });

  it('leaves an invalid JSON config untouched when loading', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, 'not-json');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(loadConfig(tmpDir).maxToolTurns).toBe(20);
    expect(readFileSync(configPath, 'utf8')).toBe('not-json');
  });

  it('keeps the decoded config when the max tool turns backfill cannot be written', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }));
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    chmodSync(configDir, 0o500);
    try {
      expect(loadConfig(tmpDir).maxToolTurns).toBe(20);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      chmodSync(configDir, 0o700);
    }
  });

  it('keeps the decoded harness log defaults when the backfill cannot be written', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }));
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    chmodSync(configDir, 0o500);
    try {
      const config = loadConfig(tmpDir);
      expect(config.logEnabled).toBe(true);
      expect(config.logRetentionInDays).toBe(DEFAULT_LOG_RETENTION_IN_DAYS);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      chmodSync(configDir, 0o700);
    }
  });

  it('defaults native alerts and validates per-category bell settings', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      osNotifications: false,
      terminalBell: false,
      terminalBellVolumeSuccess: 0.2,
      terminalBellVolumeWarning: -1,
      terminalBellVolumeError: 4,
      terminalBellMuteError: true,
    }));
    const config = loadConfig(tmpDir);
    expect(config.osNotifications).toBe(false);
    expect(config.terminalBell).toBe(false);
    expect(config.terminalBellVolumeSuccess).toBe(0.2);
    expect(config.terminalBellVolumeWarning).toBe(0.8);
    expect(config.terminalBellVolumeError).toBe(0.8);
    expect(config).not.toHaveProperty('terminalBellMuteError');
  });

  it('enables desktop and bell by default for existing projects', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), '{}');
    const config = loadConfig(tmpDir);
    expect(config.osNotifications).toBe(true);
    expect(config.terminalBell).toBe(true);
  });

  it('falls back to defaults for missing fields in existing config', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({}) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });

  it('falls back independently for invalid scalar, list, and map fields', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      transcriptMaxLines: 'many',
      tabNameMaxLength: 8,
      sandboxWorkspaces: 'yes',
      syncPaths: 'product/',
      externalViewers: { video: 42 },
    }));

    const config = loadConfig(tmpDir);

    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
    expect(config.tabNameMaxLength).toBe(8);
    expect(config.sandboxWorkspaces).toBe(true);
    expect(config.syncPaths).toEqual(['product/backlog/', 'product/plans/']);
    expect(config.externalViewers).toEqual({ video: 'QuickTime Player' });
  });

  // `recordShellTabs` was retired in favor of `logEnabled`: it is no longer read, and it is dropped
  // from the file only when Janissary writes the file for another reason.
  it('ignores a retired recordShellTabs key', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ recordShellTabs: false }));

    const config = loadConfig(tmpDir);

    expect(config).not.toHaveProperty('recordShellTabs');
    expect(config.logEnabled).toBe(true);
  });

  it('strips recordShellTabs when a backfill rewrites the file', () => {
    const configDir = path.join(tmpDir, '.janissary');
    const configPath = path.join(configDir, 'config.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ recordShellTabs: false, tabNameMaxLength: 8 }));

    loadConfig(tmpDir);

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('recordShellTabs');
    expect(written.tabNameMaxLength).toBe(8);
    expect(written.logEnabled).toBe(true);
  });

  it('strips recordShellTabs when updateConfig writes the file', () => {
    const configDir = path.join(tmpDir, '.janissary');
    const configPath = path.join(configDir, 'config.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      recordShellTabs: false, maxToolTurns: 20, logEnabled: true, logRetentionInDays: 7,
    }));
    loadConfig(tmpDir);

    expect(updateConfig({ syntaxTheme: 'nord' })).toBe(true);

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('recordShellTabs');
    expect(written.syntaxTheme).toBe('nord');
  });

  it('does not rewrite a complete config just because it carries recordShellTabs', () => {
    const configDir = path.join(tmpDir, '.janissary');
    const configPath = path.join(configDir, 'config.json');
    mkdirSync(configDir, { recursive: true });
    const original = JSON.stringify({
      recordShellTabs: false, maxToolTurns: 20, logEnabled: true, logRetentionInDays: 7,
    });
    writeFileSync(configPath, original);

    loadConfig(tmpDir);

    expect(readFileSync(configPath, 'utf8')).toBe(original);
  });

  it('writes no recordShellTabs key to a fresh config', () => {
    loadConfig(tmpDir);

    const written = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('recordShellTabs');
  });

  it('defaults the clipboard-history cap to 15, including for a config that predates it', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ tabNameMaxLength: 8 }));

    const config = loadConfig(tmpDir);

    expect(config.clipboardHistoryMaxEntries).toBe(DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES);
    expect(config.tabNameMaxLength).toBe(8);
  });

  it('honors a raised clipboard-history cap', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ clipboardHistoryMaxEntries: 40 }));

    expect(loadConfig(tmpDir).clipboardHistoryMaxEntries).toBe(40);
  });

  it.each([0, -5, 2.5, '15', null])(
    'falls back to 15 for the nonsense clipboard-history cap %p',
    (value) => {
      const configDir = path.join(tmpDir, '.janissary');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ clipboardHistoryMaxEntries: value, tabNameMaxLength: 8 }),
      );

      const config = loadConfig(tmpDir);

      expect(config.clipboardHistoryMaxEntries).toBe(DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES);
      expect(config.tabNameMaxLength).toBe(8);
    },
  );

  it('falls back to defaults on parse error', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), 'not-json');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = loadConfig(tmpDir);

    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/config.json is invalid JSON — using defaults (file left untouched)'),
    );
  });

  it('warns on stderr and leaves the file untouched on parse error', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, 'not-json');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfig(tmpDir);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/config.json is invalid JSON — using defaults (file left untouched)'),
    );
    writeSpy.mockRestore();

    expect(readFileSync(configPath, 'utf8')).toBe('not-json');
  });

  it('getConfig returns the last loaded config', () => {
    loadConfig(tmpDir);
    expect(getConfig().transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });

  it('keeps notification settings out of config.json and loads them from notifications.json', () => {
    const config = loadConfig(tmpDir);
    expect(config.notifications?.events).toEqual({
      stateChange: false, scheduleFire: false, agentStart: false, rateLimited: false,
      commandDisabled: false, systemScheduleFire: true, modelsRefresh: true,
    });
    expect(config.notifications?.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).not.toHaveProperty('notifications');
    const raw = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'notifications.json'), 'utf8'));
    expect(raw.events.systemScheduleFire).toBe(true);
    expect(raw.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('moves a legacy notifications section out of config.json into notifications.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      custom: 'kept', maxToolTurns: 20,
      notifications: { events: { stateChange: true, systemScheduleFire: 'yes' }, customAlert: 'kept' },
    }));

    expect(loadConfig(tmpDir).notifications?.events.stateChange).toBe(true);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written).not.toHaveProperty('notifications');
    expect(written.custom).toBe('kept');
    const notificationRaw = JSON.parse(readFileSync(path.join(configDir, 'notifications.json'), 'utf8'));
    expect(notificationRaw.events).toEqual({ stateChange: true, systemScheduleFire: 'yes' });
    expect(notificationRaw.customAlert).toBe('kept');
    expect(notificationRaw.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('strips a legacy notifications section from an otherwise complete config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ maxToolTurns: 20, notifications: { events: {} } }));

    loadConfig(tmpDir);

    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      maxToolTurns: 20, logEnabled: true, logRetentionInDays: 7,
    });
  });

  it('reads custom notification settings from notifications.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'notifications.json'), JSON.stringify({
      events: { stateChange: true, systemScheduleFire: false },
      alerts: { question: { desktop: false, sound: 'error' } },
    }));

    const config = loadConfig(tmpDir);
    expect(config.notifications?.events.stateChange).toBe(true);
    expect(config.notifications?.events.systemScheduleFire).toBe(false);
    expect(config.notifications?.alerts.question).toEqual({ desktop: false, sound: 'error' });
  });

  it('defaults syncPaths to product/backlog/ and product/plans/', () => {
    const config = loadConfig(tmpDir);
    expect(config.syncPaths).toEqual(['product/backlog/', 'product/plans/']);
  });

  it('falls back to the default syncPaths when missing from an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.syncPaths).toEqual(['product/backlog/', 'product/plans/']);
  });

  it('reads a custom syncPaths list from an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ syncPaths: ['docs/notes.md'] }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.syncPaths).toEqual(['docs/notes.md']);
  });

  it('defaults externalViewers to the QuickTime Player entry for the video opener', () => {
    const config = loadConfig(tmpDir);
    expect(config.externalViewers).toEqual({ video: 'QuickTime Player' });

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.externalViewers.video).toBe('QuickTime Player');
  });

  it('replaces the whole externalViewers map with a user-supplied one', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ externalViewers: { video: 'VLC' } }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.externalViewers).toEqual({ video: 'VLC' });
  });

  it('falls back to the default externalViewers when the key is missing', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.externalViewers).toEqual({ video: 'QuickTime Player' });
  });

  it('defaults pluginSettings to an empty map and writes it on first launch', () => {
    const config = loadConfig(tmpDir);
    expect(config.pluginSettings).toEqual({});

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.pluginSettings).toEqual({});
  });

  it('keeps each object entry in pluginSettings and drops one that is not an object', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      pluginSettings: { search: { regex: true }, broken: 'nope', listed: [1] },
    }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.pluginSettings).toEqual({ search: { regex: true } });
  });

  it('falls back to an empty pluginSettings map when the value is not an object', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ pluginSettings: ['search'] }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.pluginSettings).toEqual({});
  });

  it.each([1, 8123, 65_535])('reads the integer mcpPort %p', (value) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ mcpPort: value }) + '\n');

    expect(loadConfig(tmpDir).mcpPort).toBe(value);
  });

  it.each([0, -1, 2.5, '8123', null, 65_536])('leaves mcpPort absent for %p', (value) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ mcpPort: value }) + '\n');

    expect(loadConfig(tmpDir).mcpPort).toBeUndefined();
  });

  it('does not write mcpPort into a fresh config', () => {
    loadConfig(tmpDir);

    const parsed = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8'));
    expect(parsed).not.toHaveProperty('mcpPort');
  });

  it('does not add mcpPort when backfilling an older config', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ transcriptMaxLines: 100 }));

    const config = loadConfig(tmpDir);
    expect(config.mcpPort).toBeUndefined();
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).not.toHaveProperty('mcpPort');
    expect(written.transcriptMaxLines).toBe(100);
  });

  it('preserves a hand-edited mcpPort when another key is backfilled', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ mcpPort: 8123 }));

    expect(loadConfig(tmpDir).mcpPort).toBe(8123);
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written.mcpPort).toBe(8123);
  });
});

describe('updateConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the file and updates the in-memory config', () => {
    loadConfig(tmpDir);
    const ok = updateConfig({ syntaxTheme: 'nord' });
    expect(ok).toBe(true);
    expect(getConfig().syntaxTheme).toBe('nord');

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.syntaxTheme).toBe('nord');
  });

  it('survives a reload', () => {
    loadConfig(tmpDir);
    updateConfig({ syntaxTheme: 'nord' });
    const reloaded = loadConfig(tmpDir);
    expect(reloaded.syntaxTheme).toBe('nord');
  });

  it('writes the app theme and updates the in-memory config', () => {
    loadConfig(tmpDir);
    const ok = updateConfig({ theme: 'dracula' });
    expect(ok).toBe(true);
    expect(getConfig().theme).toBe('dracula');

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.theme).toBe('dracula');
  });

  it('the app theme survives a reload', () => {
    loadConfig(tmpDir);
    updateConfig({ theme: 'dracula' });
    const reloaded = loadConfig(tmpDir);
    expect(reloaded.theme).toBe('dracula');
  });

  it('preserves max tool turns when rewriting an unrelated key and across a reload', () => {
    loadConfig(tmpDir);

    expect(updateConfig({ syntaxTheme: 'nord' })).toBe(true);
    expect(getConfig().maxToolTurns).toBe(20);
    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(JSON.parse(readFileSync(configPath, 'utf8')).maxToolTurns).toBe(20);
    expect(loadConfig(tmpDir).maxToolTurns).toBe(20);
  });

  it('preserves the clipboard-history cap when rewriting an unrelated key', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ clipboardHistoryMaxEntries: 40 }) + '\n');
    loadConfig(tmpDir);

    updateConfig({ syntaxTheme: 'nord' });

    const parsed = JSON.parse(readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    expect(parsed.clipboardHistoryMaxEntries).toBe(40);
    expect(getConfig().clipboardHistoryMaxEntries).toBe(40);
  });

  it('preserves an unknown key planted in the JSON', () => {
    loadConfig(tmpDir);
    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    parsed.customField = 'kept';
    writeFileSync(configPath, JSON.stringify(parsed) + '\n');

    updateConfig({ syntaxTheme: 'nord' });
    const after = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(after.customField).toBe('kept');
    expect(after.syntaxTheme).toBe('nord');
  });

  it('returns false when the config dir has been removed', () => {
    loadConfig(tmpDir);
    rmSync(path.join(tmpDir, '.janissary'), { recursive: true, force: true });
    const ok = updateConfig({ syntaxTheme: 'nord' });
    expect(ok).toBe(false);
    expect(getConfig().syntaxTheme).toBe(DEFAULT_SYNTAX_THEME);
  });

  it('leaves no temporary sibling after a successful update', () => {
    loadConfig(tmpDir);

    expect(updateConfig({ syntaxTheme: 'nord' })).toBe(true);

    expect(readdirSync(path.join(tmpDir, '.janissary'))).toEqual(['config.json', 'notifications.json']);
  });

  it('preserves restrictive permissions on an existing config file', () => {
    loadConfig(tmpDir);
    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    chmodSync(configPath, 0o600);

    expect(updateConfig({ syntaxTheme: 'nord' })).toBe(true);

    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it('round-trips syncPaths like other settings', () => {
    loadConfig(tmpDir);
    const ok = updateConfig({ syncPaths: ['docs/notes.md', 'src/config.ts'] });
    expect(ok).toBe(true);
    expect(getConfig().syncPaths).toEqual(['docs/notes.md', 'src/config.ts']);

    const reloaded = loadConfig(tmpDir);
    expect(reloaded.syncPaths).toEqual(['docs/notes.md', 'src/config.ts']);
  });

  it('round-trips pluginSettings like other settings', () => {
    loadConfig(tmpDir);
    const ok = updateConfig({ pluginSettings: { search: { matchCase: true } } });
    expect(ok).toBe(true);
    expect(getConfig().pluginSettings).toEqual({ search: { matchCase: true } });

    const reloaded = loadConfig(tmpDir);
    expect(reloaded.pluginSettings).toEqual({ search: { matchCase: true } });
  });
});
