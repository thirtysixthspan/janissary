import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';
import { DEFAULT_APP_THEME } from './app-themes.js';
import { configRecord, decodeConfig } from './config-decode.js';

// Per-event opt-in toggles for the notifications tab (see `notifications.ts`). Each defaults to
// false; the user enables an event by editing `.janissary/config.json` directly. There is
// deliberately no toggle for the `manual` event (an agent-triggered `notify`), which always fires.
export type NotificationConfig = {
  events: {
    stateChange: boolean;
    incomingMessage: boolean;
    scheduleFire: boolean;
    agentStart: boolean;
    rateLimited: boolean;
  };
};

export type Config = {
  transcriptMaxLines: number;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  // Isolate workspaced tabs (`agent --workspace`, `harness --workspace`) to their workspace clone
  // via a Seatbelt sandbox (macOS only). Default true; the escape hatch for when it causes trouble.
  sandboxWorkspaces: boolean;
  // Run each tab's persistent shell inside a PTY and watch its output for programs that take over
  // the screen, promoting them to a full-tab terminal mid-command (see `interactive-signals.ts`).
  // Default true; with it off, shells are piped and only the name list (`interactive.ts`) applies.
  interactiveShellDetection: boolean;
  // The active syntax-highlighting theme name for editor tabs (see `syntax-themes.ts`), applied
  // globally across every open editor tab.
  syntaxTheme: string;
  // The active application color theme name (see `app-themes.ts`), applied to the whole window
  // chrome. Independent of `syntaxTheme`.
  theme: string;
  // Which background events feed the notifications tab (all opt-in; see `notifications.ts`).
  notifications?: NotificationConfig;
  // Project-relative file paths kept automatically synced with `origin/master` via a shared,
  // lazily-created workspace clone (see `git-sync.ts`). Empty by default — syncing is entirely
  // config-driven, with no UI toggle.
  syncPaths: string[];
  // The external application each opener hands a file to, keyed by opener name (see `openers/`).
  // A macOS application name, launched via the OS `open` command's `-a` flag; an empty or missing
  // entry means "use the OS default handler". Only the `video` entry is read today. Hand-edited
  // in `.janissary/config.json`, like `syncPaths` and `notifications`.
  externalViewers: Record<string, string>;
};

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25_000;
export const DEFAULT_TAB_NAME_MAX_LENGTH = 16;
export const DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH = 50;
// Cap for the tab-rename input itself, independent of tabNameMaxLength (which only truncates
// the tab strip's *display* label). Editor-tab renames go straight to a file-system rename, so
// this needs to accommodate real file names rather than the short display length.
export const TAB_RENAME_MAX_LENGTH = 50;
export const DEFAULT_SYNC_PATHS = ['product/backlog/', 'product/plans/'];
export const DEFAULT_EXTERNAL_VIEWERS: Record<string, string> = { video: 'QuickTime Player' };

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  activeTabNameMaxLength: DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  sandboxWorkspaces: true,
  interactiveShellDetection: true,
  syntaxTheme: DEFAULT_SYNTAX_THEME,
  theme: DEFAULT_APP_THEME,
  notifications: {
    events: {
      stateChange: false,
      incomingMessage: false,
      scheduleFire: false,
      agentStart: false,
      rateLimited: false,
    },
  },
  syncPaths: DEFAULT_SYNC_PATHS,
  externalViewers: DEFAULT_EXTERNAL_VIEWERS,
};

let config: Config = { ...DEFAULT_CONFIG };
let storedConfigPath: string | null = null;

function writeConfig(configPath: string, value: unknown): void {
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, undefined, 2) + '\n');
    renameSync(temporary, configPath);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export function loadConfig(projectDirectory: string): Config {
  const configDirectory = path.join(projectDirectory, '.janissary');
  const configPath = path.join(configDirectory, 'config.json');
  storedConfigPath = configPath;

  if (!existsSync(configPath)) {
    mkdirSync(configDirectory, { recursive: true });
    writeConfig(configPath, DEFAULT_CONFIG);
    config = decodeConfig(DEFAULT_CONFIG, DEFAULT_CONFIG);
    return config;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
    config = decodeConfig(parsed, DEFAULT_CONFIG);
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

// Merge `partial` into the in-memory config and write it back to `.janissary/config.json`.
// Reads and re-stringifies the raw file (rather than the parsed `Config` defaults) so unknown
// keys a user added by hand survive the round trip. Returns false (without throwing) on failure,
// so the caller can report it to the transcript instead.
export function updateConfig(partial: Partial<Config>): boolean {
  if (!storedConfigPath) return false;
  try {
    const parsed: unknown = existsSync(storedConfigPath) ? JSON.parse(readFileSync(storedConfigPath, 'utf8')) : {};
    const raw = configRecord(parsed);
    if (!raw) return false;
    const merged = { ...raw, ...partial };
    const next = decodeConfig({ ...config, ...partial }, DEFAULT_CONFIG);
    writeConfig(storedConfigPath, merged);
    config = next;
    return true;
  } catch {
    return false;
  }
}
