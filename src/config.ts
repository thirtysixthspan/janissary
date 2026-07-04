import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './types.js';

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25_000;
export const DEFAULT_TAB_NAME_MAX_LENGTH = 16;

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  sandboxWorkspaces: true,
};

let config: Config = { ...DEFAULT_CONFIG };

export function loadConfig(projectDirectory: string): Config {
  const configDirectory = path.join(projectDirectory, '.janissary');
  const configPath = path.join(configDirectory, 'config.json');

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
