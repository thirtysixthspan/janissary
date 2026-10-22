import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, chmodSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import {
  loadConfig, getConfig, updateConfig, DEFAULT_TRANSCRIPT_MAX_LINES,
  DEFAULT_TAB_NAME_MAX_LENGTH, DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES,
} from './config.js';
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

  // A config written before shell recording existed must keep recording: the key is an opt-out, not
  // a new default, so a missing key resolving to anything else would silently stop writing every
  // shell session on every project that already had a config file.
  it('records shell tabs by default, including for a config that predates the key', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ tabNameMaxLength: 8 }));

    const config = loadConfig(tmpDir);

    expect(config.recordShellTabs).toBe(true);
  });

  it('stops recording shell tabs when the key is turned off, and nothing else', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ recordShellTabs: false }));

    const config = loadConfig(tmpDir);

    expect(config.recordShellTabs).toBe(false);
    // Nothing else follows from it: harness and ssh tabs have no echo of their own and keep
    // recording, so this key must not be readable as a recording switch in general.
    expect(config.sandboxWorkspaces).toBe(true);
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

  it('writes a default notifications block with system schedule notices on', () => {
    const config = loadConfig(tmpDir);
    expect(config.notifications?.events).toEqual({
      stateChange: false, scheduleFire: false, agentStart: false, rateLimited: false, systemScheduleFire: true,
    });
    expect(config.notifications?.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(JSON.parse(readFileSync(configPath, 'utf8')).notifications.events.stateChange).toBe(false);
    expect(JSON.parse(readFileSync(configPath, 'utf8')).notifications.events.systemScheduleFire).toBe(true);
  });

  it('reads custom notification event toggles from an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ notifications: { events: { stateChange: false, scheduleFire: false, agentStart: false } } }) + '\n',
    );

    expect(loadConfig(tmpDir).notifications?.events.stateChange).toBe(false);
  });

  it('fills omitted and invalid notification toggles from defaults without discarding valid neighbors', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    const raw = JSON.stringify({
      notifications: { events: { stateChange: true, scheduleFire: false, systemScheduleFire: 'yes' } },
    });
    writeFileSync(configPath, raw);

    expect(loadConfig(tmpDir).notifications?.events).toEqual({
        stateChange: true,
        scheduleFire: false,
        agentStart: false,
        rateLimited: false,
        systemScheduleFire: true,
    });
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.notifications.events).toEqual({ stateChange: true, scheduleFire: false, systemScheduleFire: 'yes' });
    expect(written.notifications.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it.each([
    {},
    { notifications: null },
    { notifications: { events: null } },
    { notifications: { events: { stateChange: true } } },
  ])('defaults system schedule notices on for missing or malformed settings: %j', (rawConfig) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    const raw = JSON.stringify(rawConfig);
    writeFileSync(configPath, raw);

    expect(loadConfig(tmpDir).notifications?.events.systemScheduleFire).toBe(true);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    if ('notifications' in rawConfig && rawConfig.notifications && typeof rawConfig.notifications === 'object') {
      expect(written.notifications.events).toEqual(rawConfig.notifications.events);
    } else {
      expect(written.notifications.events).toEqual({
        stateChange: false, scheduleFire: false, agentStart: false, rateLimited: false, systemScheduleFire: true,
      });
    }
    expect(written.notifications.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('preserves an explicit false system schedule toggle', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      notifications: { events: { systemScheduleFire: false } },
    }));

    expect(loadConfig(tmpDir).notifications?.events.systemScheduleFire).toBe(false);
  });

  it('writes notification alert defaults alphabetically in a fresh config', () => {
    loadConfig(tmpDir);
    const raw = JSON.parse(readFileSync(path.join(tmpDir, '.janissary', 'config.json'), 'utf8'));
    expect(raw.notifications.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
    expect(Object.keys(raw.notifications.alerts)).toEqual(Object.keys(NOTIFICATION_ALERT_DEFAULTS).toSorted((left, right) => left.localeCompare(right)));
  });

  it('backfills alerts while preserving unknown and removed keys', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({
      custom: 'kept', terminalBellMuteError: true,
      notifications: { events: { systemScheduleFire: 'yes' }, customAlert: 'kept' },
    }));

    loadConfig(tmpDir);

    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.custom).toBe('kept');
    expect(written.terminalBellMuteError).toBe(true);
    expect(written.notifications.events).toEqual({ systemScheduleFire: 'yes' });
    expect(written.notifications.customAlert).toBe('kept');
    expect(written.notifications.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
  });

  it('replaces malformed alerts and fills only missing types without changing present entries', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ notifications: { events: null, alerts: 'off' } }));
    loadConfig(tmpDir);
    expect(JSON.parse(readFileSync(configPath, 'utf8')).notifications.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);

    const partial: Record<string, unknown> = {
      ...NOTIFICATION_ALERT_DEFAULTS,
      'agent-start': { desktop: 'bad', custom: true },
    };
    delete partial.question;
    delete partial['state-change'];
    writeFileSync(configPath, JSON.stringify({ notifications: { events: null, alerts: partial } }));
    loadConfig(tmpDir);
    const written = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(written.notifications.events).toBeNull();
    expect(written.notifications.alerts['agent-start']).toEqual(partial['agent-start']);
    expect(written.notifications.alerts.question).toEqual(NOTIFICATION_ALERT_DEFAULTS.question);
    expect(written.notifications.alerts['state-change']).toEqual(NOTIFICATION_ALERT_DEFAULTS['state-change']);
    expect(Object.keys(written.notifications.alerts)).toHaveLength(Object.keys(NOTIFICATION_ALERT_DEFAULTS).length);
  });

  it('does not rewrite a complete alert map or invalid JSON', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    const complete = JSON.stringify({ notifications: { events: {}, alerts: NOTIFICATION_ALERT_DEFAULTS } });
    writeFileSync(configPath, complete);
    loadConfig(tmpDir);
    expect(readFileSync(configPath, 'utf8')).toBe(complete);
    writeFileSync(configPath, 'not-json');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadConfig(tmpDir);
    expect(readFileSync(configPath, 'utf8')).toBe('not-json');
  });

  it('uses decoded defaults and stays silent when alert backfill cannot be written', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ notifications: { alerts: null } }));
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    chmodSync(configDir, 0o500);
    try {
      expect(loadConfig(tmpDir).notifications?.alerts).toEqual(NOTIFICATION_ALERT_DEFAULTS);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      chmodSync(configDir, 0o700);
    }
  });

  it('decodes alert fields independently and drops unknown or non-object entries', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ notifications: { alerts: {
      question: { desktop: false, sound: 'error' },
      manual: { sound: 'none' },
      'file-operation': { desktop: true, sound: 'loud' },
      unknown: { desktop: true, sound: 'success' },
      'state-change': 'invalid',
    } } }));

    const alerts = loadConfig(tmpDir).notifications?.alerts;
    expect(alerts?.question).toEqual({ desktop: false, sound: 'error' });
    expect(alerts?.manual).toEqual({ desktop: true, sound: 'none' });
    expect(alerts?.['file-operation']).toEqual({ desktop: true, sound: 'error' });
    expect(alerts?.['state-change']).toEqual(NOTIFICATION_ALERT_DEFAULTS['state-change']);
    expect(alerts).not.toHaveProperty('unknown');
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

    expect(readdirSync(path.join(tmpDir, '.janissary'))).toEqual(['config.json']);
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
