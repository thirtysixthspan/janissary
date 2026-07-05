import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './types.js';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25_000;
export const DEFAULT_TAB_NAME_MAX_LENGTH = 16;

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  sandboxWorkspaces: true,
  syntaxTheme: DEFAULT_SYNTAX_THEME,
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
