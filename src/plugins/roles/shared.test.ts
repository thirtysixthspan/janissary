import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMoveEntryIntent, isRemoveEntryIntent, isRolesPayload, isSetEntryEffortIntent, type RolesPayload } from './shared.js';

const CATALOG = { models: { codex: ['gpt-6-sol'], claude: ['claude-opus-5-5'] }, efforts: ['low', 'xhigh'] };

const POSITIONAL_INTENTS = [
  { name: 'remove', guard: isRemoveEntryIntent, fields: { index: 0 } },
  { name: 'move', guard: isMoveEntryIntent, fields: { from: 0, to: 1 } },
  { name: 'effort', guard: isSetEntryEffortIntent, fields: { index: 0, effort: null } },
];

describe('positional entry intent guards', () => {
  it.each(POSITIONAL_INTENTS)('accepts a complete ordered snapshot for $name', ({ guard, fields }) => {
    const entry = { harness: 'codex', model: 'same', effort: 'xhigh' };
    expect(guard({ role: 'planning', ...fields, expected: [entry, entry] })).toBe(true);
    expect(guard({ role: 'planning', ...fields, expected: [] })).toBe(true);
  });

  it.each(POSITIONAL_INTENTS)('refuses absent or malformed snapshots for $name', ({ guard, fields }) => {
    const intent = { role: 'planning', ...fields };
    expect(guard(intent)).toBe(false);
    for (const expected of [null, {}, 'snapshot', [null], [{ model: 'same' }], [{ harness: 'codex', model: 'same', effort: 1 }]]) {
      expect(guard({ ...intent, expected })).toBe(false);
    }
  });
});

function payload(catalog: unknown, roles: RolesPayload['roles'] = []): unknown {
  return { roles, source: 'home', path: '/home/me/.janissary/roles.json', catalog };
}

describe('the roles payload guard', () => {
  it('accepts a catalog whose every harness maps to a list of model ids', () => {
    expect(isRolesPayload(payload(CATALOG))).toBe(true);
  });

  it('accepts the empty catalog the host answers a revoked capability with', () => {
    expect(isRolesPayload(payload({ models: {}, efforts: [] }))).toBe(true);
  });

  it('refuses a model catalog that is not a record of lists', () => {
    expect(isRolesPayload(payload(null))).toBe(false);
    expect(isRolesPayload(payload([['gpt-6-sol']]))).toBe(false);
    expect(isRolesPayload(payload('codex'))).toBe(false);
  });

  it('refuses a harness whose models are not a list of strings', () => {
    expect(isRolesPayload(payload({ models: { codex: 'gpt-6-sol' }, efforts: [] }))).toBe(false);
    expect(isRolesPayload(payload({ models: { codex: ['gpt-6-sol', 7] }, efforts: [] }))).toBe(false);
    expect(isRolesPayload(payload({ models: { codex: ['gpt-6-sol'], claude: {} }, efforts: [] }))).toBe(false);
  });

  it('accepts a stored role whose harness, model, and effort are outside the catalog', () => {
    const roles = [{
      name: 'review',
      description: 'Second pair of eyes.',
      entries: [{ harness: 'retired-harness', model: 'retired-model', effort: 'ultra' }],
    }];

    expect(isRolesPayload(payload(CATALOG, roles))).toBe(true);
  });

  // The client reaches this module through `@shared/plugins/roles/shared`, so an import here is a
  // runtime dependency from a browser chunk into a server module. No lint rule covers one file, and
  // the thirteen sibling contracts that do carry the import are out of this unit's scope, so the
  // contract asserts its own shape where a reader of these guards already is.
  it('declares no imports of its own', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'shared.ts'), 'utf8');

    expect(source).not.toMatch(/^ *(import|export) +(type )?(\*|\{|')/m);
  });
});
