import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { loadConfig, getConfig, DEFAULT_TRANSCRIPT_MAX_LINES } from './config.js';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a default config.json when none exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });

  it('reads an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ transcriptMaxLines: 100 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(100);
  });

  it('falls back to defaults for missing fields in existing config', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({}) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });

  it('falls back to defaults on parse error', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), 'not-json');

    const config = loadConfig(tmpDir);
    expect(config.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });

  it('getConfig returns the last loaded config', () => {
    loadConfig(tmpDir);
    expect(getConfig().transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
  });
});
