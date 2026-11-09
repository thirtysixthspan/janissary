import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rolesManifest } from './manifest.js';
import {
  isAddCommandIntent, isAddEntryIntent, isMoveEntryIntent, isRemoveCommandIntent,
  isRemoveEntryIntent, isRolesPayload, isSetEntryEffortIntent, NATIVE_ACP_COMMANDS,
  ROLES_PAYLOAD_SCHEMA_VERSION,
  type RolesPayload,
} from './shared.js';

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

describe('new entry intent guard', () => {
  it('rejects the payload-only missing marker so it cannot be written to roles.json', () => {
    expect(isAddEntryIntent({ role: 'review', entry: { harness: 'codex', model: 'gpt-6-sol' } })).toBe(true);
    expect(isAddEntryIntent({
      role: 'review', entry: { harness: 'codex', model: 'gpt-6-sol', missing: true },
    })).toBe(false);
    expect(isAddEntryIntent({
      role: 'review', entry: { harness: 'codex', model: 'gpt-6-sol', missing: false },
    })).toBe(false);
  });
});

function payload(catalog: unknown, roles: RolesPayload['roles'] = []): unknown {
  return {
    roles, nativeCommands: [...NATIVE_ACP_COMMANDS], commandRestrictions: {},
    source: 'home', path: '/home/me/.janissary/roles.json', catalog,
  };
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
      commands: ['custom command', 'browser goto'],
    }];

    expect(isRolesPayload(payload(CATALOG, roles))).toBe(true);
  });

  it('accepts an optional boolean missing marker and refuses malformed markers', () => {
    const roles = [{
      name: 'review', description: 'Second pair of eyes.', entries: [
        { harness: 'retired-harness', model: 'retired-model', missing: true },
      ],
      commands: [],
    }];

    expect(isRolesPayload(payload(CATALOG, roles))).toBe(true);
    expect(isRolesPayload(payload(CATALOG, [{
      ...roles[0], entries: [{ ...roles[0].entries[0], missing: false }],
    }]))).toBe(true);
    expect(isRolesPayload(payload(CATALOG, [{
      ...roles[0], entries: [{ ...roles[0].entries[0], missing: 'true' }],
    }]))).toBe(false);
  });

  it('requires each stored role command list to contain only strings', () => {
    const role = { name: 'review', description: 'Second pair of eyes.', entries: [], commands: [] };
    expect(isRolesPayload(payload(CATALOG, [role]))).toBe(true);
    expect(isRolesPayload(payload(CATALOG, [{ ...role, commands: 'browser goto' }]))).toBe(false);
    expect(isRolesPayload(payload(CATALOG, [{ ...role, commands: ['browser goto', 7] }]))).toBe(false);
  });

  it('requires a native command vocabulary containing only strings', () => {
    const valid = payload(CATALOG) as Record<string, unknown>;
    expect(isRolesPayload(valid)).toBe(true);
    expect(isRolesPayload({ ...valid, nativeCommands: 'browser goto' })).toBe(false);
    expect(isRolesPayload({ ...valid, nativeCommands: ['browser goto', 7] })).toBe(false);
  });

  it('accepts an empty and a populated command restriction map', () => {
    const valid = payload(CATALOG) as Record<string, unknown>;
    expect(isRolesPayload(valid)).toBe(true);
    expect(isRolesPayload({ ...valid, commandRestrictions: { 'browser goto': 'agents' } })).toBe(true);
    expect(isRolesPayload({
      ...valid, commandRestrictions: { 'db sqlite query': 'application-wide' },
    })).toBe(true);
  });

  it('refuses a missing or malformed command restriction map', () => {
    const valid = payload(CATALOG) as Record<string, unknown>;
    const withoutRestrictions = { ...valid };
    delete withoutRestrictions.commandRestrictions;
    expect(isRolesPayload(withoutRestrictions)).toBe(false);
    expect(isRolesPayload({ ...valid, commandRestrictions: null })).toBe(false);
    expect(isRolesPayload({ ...valid, commandRestrictions: [] })).toBe(false);
    expect(isRolesPayload({ ...valid, commandRestrictions: { 'browser goto': 'disabled' } })).toBe(false);
    expect(isRolesPayload({ ...valid, commandRestrictions: { 'future command': 'agents' } })).toBe(false);
    expect(isRolesPayload({
      ...valid, nativeCommands: ['browser goto'], commandRestrictions: { 'db sqlite list': 'agents' },
    })).toBe(false);
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

describe('command edit intent guards', () => {
  it.each([
    ['add', isAddCommandIntent],
    ['remove', isRemoveCommandIntent],
  ] as const)('accepts unknown strings for %s so stored values remain editable', (_name, guard) => {
    expect(guard({ role: 'review', command: 'future command' })).toBe(true);
    expect(guard({ role: 'review', command: '' })).toBe(true);
  });

  it.each([
    ['add', isAddCommandIntent],
    ['remove', isRemoveCommandIntent],
  ] as const)('rejects malformed role or command shapes for %s', (_name, guard) => {
    expect(guard({ role: '', command: 'browser goto' })).toBe(false);
    expect(guard({ role: 'review', command: 7 })).toBe(false);
    expect(guard({ role: 'review' })).toBe(false);
  });
});

describe('roles manifest', () => {
  it('pins the payload schema and declares the models and commands topics', () => {
    expect(rolesManifest.payloadSchemaVersion).toBe(ROLES_PAYLOAD_SCHEMA_VERSION);
    expect(rolesManifest.payloadSchemaVersion).toBe(4);
    expect(rolesManifest.notifications).toEqual(['models', 'commands']);
    expect([...rolesManifest.capabilities]).toContain('topicData');
    expect([...rolesManifest.capabilities]).not.toContain('topicAction');
  });
});
