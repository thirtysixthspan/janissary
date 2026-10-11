import { describe, expect, it } from 'vitest';
import { isRolesPayload, type RolesPayload } from './shared.js';

const CATALOG = { models: { codex: ['gpt-6-sol'], claude: ['claude-opus-5-5'] }, efforts: ['low', 'xhigh'] };

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
});