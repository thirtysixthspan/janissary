import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { loadConfig, getConfig, updateConfig, DEFAULT_TRANSCRIPT_MAX_LINES, DEFAULT_TAB_NAME_MAX_LENGTH } from './config.js';
import { DEFAULT_SYNTAX_THEME } from './syntax-themes.js';

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
    expect(config.tabNameMaxLength).toBe(DEFAULT_TAB_NAME_MAX_LENGTH);
    expect(config.syntaxTheme).toBe(DEFAULT_SYNTAX_THEME);

    const configPath = path.join(tmpDir, '.janissary', 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.transcriptMaxLines).toBe(DEFAULT_TRANSCRIPT_MAX_LINES);
    expect(parsed.tabNameMaxLength).toBe(DEFAULT_TAB_NAME_MAX_LENGTH);
    expect(parsed.syntaxTheme).toBe(DEFAULT_SYNTAX_THEME);
  });

  it('reads a custom tabNameMaxLength from an existing config.json', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ tabNameMaxLength: 8 }) + '\n');

    const config = loadConfig(tmpDir);
    expect(config.tabNameMaxLength).toBe(8);
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
});
