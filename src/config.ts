import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';
import { DEFAULT_APP_THEME } from './app-themes.js';

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
};

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25_000;
export const DEFAULT_TAB_NAME_MAX_LENGTH = 16;
export const DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH = 50;
// Cap for the tab-rename input itself, independent of tabNameMaxLength (which only truncates
// the tab strip's *display* label). Editor-tab renames go straight to a file-system rename, so
// this needs to accommodate real file names rather than the short display length.
export const TAB_RENAME_MAX_LENGTH = 50;
export const DEFAULT_SYNC_PATHS = ['product/backlog/', 'product/plans/'];

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  activeTabNameMaxLength: DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  sandboxWorkspaces: true,
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
};

let config: Config = { ...DEFAULT_CONFIG };
let storedConfigPath: string | null = null;

export function loadConfig(projectDirectory: string): Config {
  const configDirectory = path.join(projectDirectory, '.janissary');
  const configPath = path.join(configDirectory, 'config.json');
  storedConfigPath = configPath;

  if (!existsSync(configPath)) {
    mkdirSync(configDirectory, { recursive: true });
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, undefined, 2) + '\n');
    config = { ...DEFAULT_CONFIG };
    return config;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<Config>;
    config = { ...DEFAULT_CONFIG, ...parsed };
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
  config = { ...config, ...partial };
  if (!storedConfigPath) return false;
  try {
    const raw = existsSync(storedConfigPath) ? (JSON.parse(readFileSync(storedConfigPath, 'utf8')) as Record<string, unknown>) : {};
    const merged = { ...raw, ...partial };
    writeFileSync(storedConfigPath, JSON.stringify(merged, undefined, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}
