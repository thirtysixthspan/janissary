import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { modelsFor, isKnownModel, loadHarnessModels } from '../harness/models.js';
import { decodeModelCatalog, encodeModelCatalog, readCatalog } from './catalog-file.js';
import { DEFAULT_ROLES } from '../plugins/roles/roles-file.js';

describe('known-models', () => {
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

  it.each([
    ['claude', 'claude-opus-5-5'],
    ['codex', 'gpt-6-sol'],
    ['opencode', 'opencode-go/deepseek-v4.1-flash'],
  ])('accepts the September 2026 %s addition %s', (harness, model) => {
    expect(isKnownModel(harness, model)).toBe(true);
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

  // The ACP agent — every conversation and every remote tab — launches on this exact pair.
  it('keeps the model the ACP agent launches with', () => {
    expect(modelsFor('opencode')).toContain('google/gemini-3.1-flash-lite');
  });

  // The default roles seed every new roles file, and the `ask` role picks the models ACP prompts
  // run on, so a default entry the catalog lacks is a choice the launcher would refuse.
  it.each(DEFAULT_ROLES.flatMap((role) => role.entries.map((entry) => [role.name, entry.harness, entry.model])))(
    'knows the default %s role model %s %s',
    (_role, harness, model) => {
      expect(isKnownModel(harness, model)).toBe(true);
    },
  );
});

describe('loadHarnessModels', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'known-models-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    loadHarnessModels(tmpDir); // reset to bundled catalog for later tests in this file
  });

  it('falls back to the bundled catalog when no override file exists', () => {
    const catalog = readCatalog(tmpDir);
    expect(catalog.fromOverride).toBe(false);
    expect(catalog.overridePath).toBe(path.join(tmpDir, '.janissary', 'known-models.json'));
    expect(catalog.catalog.claude).toContainEqual({ id: 'claude-sonnet-5' });

    loadHarnessModels(tmpDir);
    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it('reads a valid override file and uses it in place of the bundled catalog', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), JSON.stringify({ claude: [{ id: 'custom-model' }] }));

    loadHarnessModels(tmpDir);
    expect(modelsFor('claude')).toEqual(['custom-model']);
    expect(isKnownModel('claude', 'custom-model')).toBe(true);
    expect(isKnownModel('claude', 'claude-sonnet-5')).toBe(false);
  });

  it('ignores an override left under the old harness-models.json name', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'harness-models.json'), JSON.stringify({ claude: ['custom-model'] }));

    loadHarnessModels(tmpDir);
    expect(isKnownModel('claude', 'custom-model')).toBe(false);
    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it('falls back to the bundled catalog and warns on stderr when the override file is invalid JSON', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), 'not-json');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadHarnessModels(tmpDir);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/known-models.json is invalid JSON — using the bundled catalog'),
    );
    writeSpy.mockRestore();

    expect(modelsFor('claude')).toContain('claude-sonnet-5');
  });

  it.each([
    ['a list instead of an object', ['custom-model']],
    ['a bare string', 'custom-model'],
    ['null', null],
    ['a string instead of a model-record list', { claude: 'custom-model' }],
    ['a list holding a non-record', { claude: ['custom-model'] }],
    ['a record without an id', { claude: [{ name: 'Custom name' }] }],
    ['a record with an empty id', { claude: [{ id: '' }] }],
    ['a record with a non-string name', { claude: [{ id: 'custom-model', name: 7 }] }],
    ['a record with a non-boolean disabled flag', { claude: [{ id: 'custom-model', disabled: 'yes' }] }],
    ['a record with a non-boolean hidden flag', { claude: [{ id: 'custom-model', hidden: 1 }] }],
  ])('falls back to the bundled catalog and warns when the override holds %s', (_case, contents) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), JSON.stringify(contents));

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    loadHarnessModels(tmpDir);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/known-models.json is not an object of model-record lists — using the bundled catalog'),
    );
    writeSpy.mockRestore();

    expect(modelsFor('claude')).toContain('claude-sonnet-5');
    expect(isKnownModel('claude', 'custom-model')).toBe(false);
  });
});

describe('model catalog records', () => {
  it('decodes ordered model records with optional names and flags', () => {
    expect(decodeModelCatalog({
      claude: [{ id: 'first', name: 'First', disabled: true, hidden: true }, { id: 'second' }],
      codex: [],
    })).toEqual({
      claude: [{ id: 'first', name: 'First', disabled: true, hidden: true }, { id: 'second' }],
      codex: [],
    });
  });

  it.each([
    ['an empty id', { claude: [{ id: '' }] }],
    ['a missing id', { claude: [{ name: 'No id' }] }],
    ['a non-string name', { claude: [{ id: 'model', name: 3 }] }],
    ['a non-boolean disabled flag', { claude: [{ id: 'model', disabled: 'yes' }] }],
    ['a non-boolean hidden flag', { claude: [{ id: 'model', hidden: 1 }] }],
  ])('rejects the entire catalog when a record has %s', (_case, value) => {
    expect(decodeModelCatalog({ ...value, codex: [{ id: 'valid' }] })).toBeUndefined();
  });

  it('encodes records with two-space JSON, a trailing newline, and true-only flags', () => {
    const encoded = encodeModelCatalog({
      claude: [
        { id: 'enabled', name: 'Enabled', disabled: false, hidden: false },
        { id: 'disabled', disabled: true },
        { id: 'hidden', hidden: true },
      ],
    });
    expect(encoded).toBe(`{
  "claude": [
    {
      "id": "enabled",
      "name": "Enabled"
    },
    {
      "id": "disabled",
      "disabled": true
    },
    {
      "id": "hidden",
      "hidden": true
    }
  ]
}
`);
    expect(JSON.parse(encoded)).toEqual({
      claude: [
        { id: 'enabled', name: 'Enabled' },
        { id: 'disabled', disabled: true },
        { id: 'hidden', hidden: true },
      ],
    });
  });

  it('reports whether the whole project override supplied the catalog', () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'known-model-records-'));
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), JSON.stringify({ claude: [{ id: 'custom' }] }));

    const result = readCatalog(tmpDir);

    expect(result.fromOverride).toBe(true);
    expect(result.overridePath).toBe(path.join(configDir, 'known-models.json'));
    expect(result.catalog.claude).toEqual([{ id: 'custom' }]);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
