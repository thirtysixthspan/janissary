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

// The bundled catalog is hand-edited whenever a provider ships or retires a model, so these guard
// the two ways that edit goes wrong silently, and the one membership rule the refresh follows.
describe('the bundled catalog', () => {
  const harnesses = ['claude', 'codex', 'opencode'];

  it('names exactly the harnesses the specs describe', () => {
    for (const harness of harnesses) expect(modelsFor(harness).length).toBeGreaterThan(0);
  });

  it.each(harnesses)('lists only nonempty, trimmed model ids for %s', (harness) => {
    for (const model of modelsFor(harness)) {
      expect(model).toBe(model.trim());
      expect(model.length).toBeGreaterThan(0);
    }
  });

  // A duplicate is invisible in use — validation still passes — but shows twice in the conversation
  // tab's model picker.
  it.each(harnesses)('lists each model id once for %s', (harness) => {
    const models = modelsFor(harness);
    expect(new Set(models).size).toBe(models.length);
  });

  // `availableConversationModels` builds the conversation picker from the claude and opencode lists,
  // so a model that cannot answer a prompt is an offered choice that fails on the first query.
  it.each(['claude', 'opencode'])('offers no non-conversational model for %s', (harness) => {
    const excluded = /embedding|-tts|transcribe|-live|-image$|^veo|\/veo|lyria/;
    for (const model of modelsFor(harness)) expect(model).not.toMatch(excluded);
  });

  // The ACP agent — every conversation and every remote agent tab — launches on this exact pair.
  it('keeps the model the ACP agent launches with', () => {
    expect(modelsFor('opencode')).toContain('google/gemini-3.1-flash-lite');
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
