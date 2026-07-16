import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { modelsFor, isKnownModel, loadHarnessModels } from './models.js';

describe('harness-models', () => {
  it('returns the catalog for a known harness', () => {
    expect(modelsFor('opencode')).toContain('opencode-go/deepseek-v4-pro');
  });

  it('returns an empty list for an unknown harness', () => {
    expect(modelsFor('mystery')).toEqual([]);
  });

  it('accepts a known model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/deepseek-v4-pro')).toBe(true);
  });

  it('rejects an unknown model id', () => {
    expect(isKnownModel('opencode', 'opencode-go/nonexistent')).toBe(false);
  });

  it('rejects an unknown harness', () => {
    expect(isKnownModel('mystery', 'opencode-go/deepseek-v4-pro')).toBe(false);
  });

  it('returns the catalog for the claude harness', () => {
    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it('accepts a known claude model id', () => {
    expect(isKnownModel('claude', 'claude-sonnet-5')).toBe(true);
  });

  it('rejects an unknown claude model id', () => {
    expect(isKnownModel('claude', 'not-a-real-model')).toBe(false);
  });

  it('returns the catalog for the codex harness', () => {
    expect(modelsFor('codex')).toContain('gpt-5.5');
  });

  it('accepts a known codex model id', () => {
    expect(isKnownModel('codex', 'gpt-5.5')).toBe(true);
  });

  it('rejects an unknown codex model id', () => {
    expect(isKnownModel('codex', 'not-a-real-model')).toBe(false);
  });
});

describe('loadHarnessModels', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'harness-models-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    loadHarnessModels(tmpDir); // reset to bundled catalog for later tests in this file
  });

  it('falls back to the bundled catalog when no override file exists', () => {
    loadHarnessModels(tmpDir);
    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it('reads a valid override file and uses it in place of the bundled catalog', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'harness-models.json'), JSON.stringify({ claude: ['custom-model'] }));

    loadHarnessModels(tmpDir);
    expect(modelsFor('claude')).toEqual(['custom-model']);
    expect(isKnownModel('claude', 'custom-model')).toBe(true);
    expect(isKnownModel('claude', 'claude-sonnet-5')).toBe(false);
  });

  it('falls back to the bundled catalog and warns on stderr when the override file is invalid JSON', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'harness-models.json'), 'not-json');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadHarnessModels(tmpDir);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/harness-models.json is invalid JSON — using the bundled catalog'),
    );
    writeSpy.mockRestore();

    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });
});
