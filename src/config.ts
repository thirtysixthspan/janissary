import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';
import { DEFAULT_APP_THEME } from './app-themes.js';
import { backfillMissingKeys, configRecord, decodeConfig } from './config-decode.js';
import { DEFAULT_NOTIFICATION_CONFIG, loadNotificationConfig, saveNotificationConfig } from './notifications/config.js';
import { DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH, DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES, DEFAULT_TAB_NAME_MAX_LENGTH } from './shared/config-defaults.js';
import type { NotificationEventType } from './notifications/index.js';
import type { NotificationAlert } from './notifications/alert-defaults.js';

// Per-event notification toggles (see `notifications/index.ts`). Ambient events default to false;
// system schedule and model refresh notices default to true. There is deliberately no toggle for
// `manual` (an agent-triggered `notify`), which always fires.
export type NotificationConfig = {
  events: {
    stateChange: boolean;
    scheduleFire: boolean;
    agentStart: boolean;
    rateLimited: boolean;
    commandDisabled: boolean;
    systemScheduleFire: boolean;
    modelsRefresh: boolean;
  };
  alerts: Record<NotificationEventType, NotificationAlert>;
};

export type Config = {
  transcriptMaxLines: number;
  maxToolTurns: number;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  // How many entries the clipboard-history popup keeps (see `clipboard-history` in the specs). A cap
  // rather than a count of everything copied, so the popup stays a menu. Hand-edited, like
  // `transcriptMaxLines`, and read by the client — the browser has no storage of its own.
  clipboardHistoryMaxEntries: number;
  // Isolate workspaced tabs (`shell --workspace`, `harness --workspace`) to their workspace clone
  // via a Seatbelt sandbox (macOS only). Default true; the escape hatch for when it causes trouble.
  sandboxWorkspaces: boolean;
  // Record shell tabs' sessions to asciicast files under `.janissary/recordings/`, as harness and ssh
  // tabs are recorded (see `harness-recording.md`). Default true. The escape hatch is not only that
  // it writes what the shell printed to disk: a shell echoes every character typed back into the
  // terminal, and that echo is part of the recorded output, so a password entered at a `sudo` or
  // `psql` prompt lands in the file where the same secret in a harness or ssh tab would not.
  //
  // It gates every plugin terminal whose declaration asked to be recorded, which is the shell plugin's
  // alone today — the name says what is off now, not what the gate may never widen to. Named-harness
  // and ssh tabs never reach that path and are recorded whatever this says.
  recordShellTabs: boolean;
  // Whether harness and shell transcript files, activity logs under `.janissary/logs/activity/`, and
  // harness, ssh, and shell recordings under `.janissary/recordings/` are written at all (see
  // `product/specs/application-config.md`). Default true; the escape hatch for turning transcript,
  // activity-log, and recording writing off entirely.
  logEnabled: boolean;
  // How many days a harness or shell transcript, a harness capture file, a recording, or an activity
  // log is kept, with `0` keeping none from earlier runs (see `product/specs/application-config.md`).
  logRetentionInDays: number;
  // Run each tab's persistent shell inside a PTY and watch its output for programs that take over
  // the screen, promoting them to a full-tab terminal mid-command (see `interactive/signals.ts`).
  // Default true; with it off, shells are piped and only the name list (`interactive/index.ts`)
  // applies.
  // The active syntax-highlighting theme name for editor tabs (see `syntax-themes.ts`), applied
  // globally across every open editor tab.
  syntaxTheme: string;
  // The active application color theme name (see `app-themes.ts`), applied to the whole window
  // chrome. Independent of `syntaxTheme`.
  theme: string;
  // Which background events feed the notifications tab (all opt-in; see `notifications/index.ts`).
  notifications?: NotificationConfig;
  osNotifications: boolean;
  terminalBell: boolean;
  terminalBellVolumeSuccess: number;
  terminalBellVolumeWarning: number;
  terminalBellVolumeError: number;
  // Project-relative file paths kept automatically synced with `origin/master` via a shared,
  // lazily-created workspace clone (see `git/sync.ts`). Defaults to `DEFAULT_SYNC_PATHS` (the
  // project's backlog and plans folders) — syncing is entirely config-driven, with no UI toggle.
  syncPaths: string[];
  // The external application each opener hands a file to, keyed by opener name (see `openers/`).
  // A macOS application name, launched via the OS `open` command's `-a` flag; an empty or missing
  // entry means "use the OS default handler". Only the `video` entry is read today. Hand-edited
  // in `.janissary/config.json`, like `syncPaths` and `notifications`.
  externalViewers: Record<string, string>;
  // Each tab plugin's own remembered preferences, keyed by plugin id — the search tab's toggles, for
  // one. A plugin reaches only its own entry, through the `readSettings`/`saveSettings` capabilities
  // (see `plugins/settings.ts`), and the value is whatever JSON object that plugin chose to save.
  pluginSettings: Record<string, Record<string, unknown>>;
};

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25_000;
export const DEFAULT_MAX_TOOL_TURNS = 20;
export const DEFAULT_LOG_RETENTION_IN_DAYS = 7;
export const DEFAULT_SYNC_PATHS = ['product/backlog/', 'product/plans/'];
export const DEFAULT_EXTERNAL_VIEWERS: Record<string, string> = { video: 'QuickTime Player' };

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
  maxToolTurns: DEFAULT_MAX_TOOL_TURNS,
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  activeTabNameMaxLength: DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  clipboardHistoryMaxEntries: DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES,
  sandboxWorkspaces: true,
  logEnabled: true,
  logRetentionInDays: DEFAULT_LOG_RETENTION_IN_DAYS,
  syntaxTheme: DEFAULT_SYNTAX_THEME,
  theme: DEFAULT_APP_THEME,
  notifications: DEFAULT_NOTIFICATION_CONFIG,
  osNotifications: true,
  terminalBell: true,
  terminalBellVolumeSuccess: 0.8,
  terminalBellVolumeWarning: 0.8,
  terminalBellVolumeError: 0.8,
  syncPaths: DEFAULT_SYNC_PATHS,
  externalViewers: DEFAULT_EXTERNAL_VIEWERS,
  pluginSettings: {},
};

let config: Config = { ...DEFAULT_CONFIG };
let storedConfigPath: string | null = null;

export function loadConfig(projectDirectory: string): Config {
  const configDirectory = path.join(projectDirectory, '.janissary');
  const configPath = path.join(configDirectory, 'config.json');
  storedConfigPath = configPath;

  const notifications = loadNotificationConfig(projectDirectory);

  if (!existsSync(configPath)) {
    mkdirSync(configDirectory, { recursive: true });
    const initial: Config = { ...DEFAULT_CONFIG };
    delete initial.notifications;
    atomicWriteFile(configPath, JSON.stringify(initial, undefined, 2) + '\n');
    config = { ...decodeConfig(DEFAULT_CONFIG, DEFAULT_CONFIG), notifications };
    return config;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
    config = decodeConfig(parsed, DEFAULT_CONFIG);
    config.notifications = notifications;
    const raw = configRecord(parsed);
    const backfilled = backfillMissingKeys(parsed, DEFAULT_CONFIG);
    if (backfilled || (raw && Object.hasOwn(raw, 'notifications'))) {
      const stripped: Record<string, unknown> = { ...(backfilled ?? raw) };
      delete stripped.notifications;
      delete stripped.recordShellTabs;
      try {
        atomicWriteFile(configPath, JSON.stringify(stripped, undefined, 2) + '\n');
      } catch {
        return config;
      }
    }
    return config;
  } catch {
    process.stderr.write('warning: .janissary/config.json is invalid JSON — using defaults (file left untouched)\n');
    config = { ...DEFAULT_CONFIG };
    return config;
  }
}

export function getConfig(): Config {
  return config;
}

// Merge `partial` into the in-memory config. Notification settings go to their own file; every
// other setting reads and re-stringifies the raw config.json (rather than the parsed `Config`
// defaults) so unknown keys a user added by hand survive the round trip. Returns false (without
// throwing) on failure, so the caller can report it to the transcript instead.
export function updateConfig(partial: Partial<Config>): boolean {
  if (!storedConfigPath) return false;
  if (partial.notifications !== undefined) {
    if (!saveNotificationConfig(partial.notifications)) return false;
    config = { ...config, notifications: partial.notifications };
    return true;
  }
  try {
    const parsed: unknown = existsSync(storedConfigPath) ? JSON.parse(readFileSync(storedConfigPath, 'utf8')) : {};
    const raw = configRecord(parsed);
    if (!raw) return false;
    const merged: Record<string, unknown> = { ...raw, ...partial };
    delete merged.recordShellTabs;
    const next = decodeConfig({ ...config, ...partial }, DEFAULT_CONFIG);
    next.notifications = config.notifications;
    atomicWriteFile(storedConfigPath, JSON.stringify(merged, undefined, 2) + '\n');
    config = next;
    return true;
  } catch {
    return false;
  }
}
