import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.js';

export const DEFAULT_TRANSCRIPT_MAX_LINES = 25000;

const DEFAULT_CONFIG: Config = {
  transcriptMaxLines: DEFAULT_TRANSCRIPT_MAX_LINES,
};

let config: Config = { ...DEFAULT_CONFIG };

export function loadConfig(projectDir: string): Config {
  const configDir = join(projectDir, '.janussary');
  const configPath = join(configDir, 'config.json');

  if (!existsSync(configPath)) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    config = { ...DEFAULT_CONFIG };
    return config;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
    config = { ...DEFAULT_CONFIG, ...parsed };
    return config;
  } catch {
    config = { ...DEFAULT_CONFIG };
    return config;
  }
}

export function getConfig(): Config {
  return config;
}
