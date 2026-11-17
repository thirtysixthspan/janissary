import { describe, expect, it } from 'vitest';
import type { ProjectTokenName } from '../../project/tokens.js';
import { isConfigured, providerApiKey, searchesWeb } from './capabilities.js';
import type { WebSearchProviderManifest } from './contract.js';

function manifest(token?: ProjectTokenName): WebSearchProviderManifest {
  return {
    id: 'test',
    apiVersion: 1,
    ...(token !== undefined && { token }),
    activate: async () => ({ provider: {} }),
  };
}

describe('isConfigured', () => {
  it('is true when the named token has a non-empty value', () => {
    expect(isConfigured(manifest('tavily'), { tavily: 'key' })).toBe(true);
  });

  it('is false when the named token is an empty string', () => {
    expect(isConfigured(manifest('tavily'), { tavily: '' })).toBe(false);
  });

  it('is false when the named token value is missing', () => {
    expect(isConfigured(manifest('tavily'), {})).toBe(false);
  });

  it('is true when the manifest names no token', () => {
    expect(isConfigured(manifest(), {})).toBe(true);
  });
});

describe('searchesWeb', () => {
  it('is true when search is absent', () => {
    expect(searchesWeb(manifest())).toBe(true);
  });

  it('is true when search is true', () => {
    expect(searchesWeb({ ...manifest(), search: true })).toBe(true);
  });

  it('is false when search is false', () => {
    expect(searchesWeb({ ...manifest(), search: false })).toBe(false);
  });
});

describe('providerApiKey', () => {
  it('returns the named token value', () => {
    expect(providerApiKey(manifest('tavily'), { tavily: 'key' })).toBe('key');
  });

  it("returns '' when the named token value is missing", () => {
    expect(providerApiKey(manifest('tavily'), {})).toBe('');
  });

  it("returns '' when the manifest names no token", () => {
    expect(providerApiKey(manifest(), { tavily: 'key' })).toBe('');
  });
});
