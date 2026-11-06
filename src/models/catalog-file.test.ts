import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  BUNDLED_MODEL_CATALOG, decodeModelCatalog, encodeModelCatalog, readCatalog,
} from './catalog-file.js';
import { DEFAULT_ROLES } from '../plugins/roles/roles-file.js';

describe('bundled model catalog', () => {
  const harnesses = ['claude', 'codex', 'opencode'];

  it('contains the harnesses the specs describe', () => {
    expect(Object.keys(BUNDLED_MODEL_CATALOG)).toEqual(harnesses);
  });

  it.each(harnesses)('contains unique, nonempty, trimmed ids for %s', (harness) => {
    const ids = (BUNDLED_MODEL_CATALOG[harness] ?? []).map(({ id }) => id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.length > 0 && id === id.trim())).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(['claude', 'opencode'])('contains no non-conversational model for %s', (harness) => {
    const excluded = /embedding|-tts|transcribe|-live|-image$|^veo|\/veo|lyria/;
    const records = BUNDLED_MODEL_CATALOG[harness] ?? [];
    for (const { id } of records) expect(id).not.toMatch(excluded);
  });

  it.each(DEFAULT_ROLES.flatMap((role) => role.entries.map((entry) => [role.name, entry.harness, entry.model])))
    ('includes the default %s role model %s %s', (_role, harness, model) => {
      const ids = new Set((BUNDLED_MODEL_CATALOG[harness] ?? []).map(({ id }) => id));
      expect(ids.has(model)).toBe(true);
    });
});

describe('catalog reads', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'known-models-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses the bundled catalog when no override exists', () => {
    const result = readCatalog(tmpDir);

    expect(result.fromOverride).toBe(false);
    expect(result.overridePath).toBe(path.join(tmpDir, '.janissary', 'known-models.json'));
    expect(result.catalog).toEqual(BUNDLED_MODEL_CATALOG);
  });

  it('uses a valid project override in place of the bundled catalog', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), JSON.stringify({
      claude: [{ id: 'custom-model', hidden: true }, { id: 'disabled-model', disabled: true }],
    }));

    const result = readCatalog(tmpDir);

    expect(result.fromOverride).toBe(true);
    expect(result.catalog).toEqual({
      claude: [{ id: 'custom-model', hidden: true }, { id: 'disabled-model', disabled: true }],
    });
  });

  it('ignores an override left under the old harness-models.json name', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'harness-models.json'), JSON.stringify({ claude: ['custom-model'] }));

    const result = readCatalog(tmpDir);

    expect(result.fromOverride).toBe(false);
    expect(result.catalog).toEqual(BUNDLED_MODEL_CATALOG);
  });

  it('falls back to the bundled catalog and warns when the override is invalid JSON', () => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), 'not-json');
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = readCatalog(tmpDir);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/known-models.json is invalid JSON — using the bundled catalog'),
    );
    expect(result.catalog).toEqual(BUNDLED_MODEL_CATALOG);
  });

  it.each([
    ['a list instead of an object', ['custom-model']],
    ['a bare string', 'custom-model'],
    ['null', null],
    ['a string instead of a record list', { claude: 'custom-model' }],
    ['a list holding a non-record', { claude: ['custom-model'] }],
    ['a record without an id', { claude: [{ name: 'Custom name' }] }],
    ['a record with an empty id', { claude: [{ id: '' }] }],
    ['a record with a non-string name', { claude: [{ id: 'custom-model', name: 7 }] }],
    ['a record with a non-boolean disabled flag', { claude: [{ id: 'custom-model', disabled: 'yes' }] }],
    ['a record with a non-boolean hidden flag', { claude: [{ id: 'custom-model', hidden: 1 }] }],
  ])('falls back and warns when the override contains %s', (_case, contents) => {
    const configDir = path.join(tmpDir, '.janissary');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(path.join(configDir, 'known-models.json'), JSON.stringify(contents));
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = readCatalog(tmpDir);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('.janissary/known-models.json is not an object of model-record lists — using the bundled catalog'),
    );
    expect(result.catalog).toEqual(BUNDLED_MODEL_CATALOG);
  });
});

describe('model catalog records', () => {
  it('decodes ordered records with optional names and flags', () => {
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
  });
});
