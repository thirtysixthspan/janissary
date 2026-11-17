import { describe, expect, it, vi } from 'vitest';
import { WEB_PROVIDER_API_VERSION } from '../contract.js';
import type { WebFetchRequest, WebSearchCapability } from '../contract.js';
import { createProviderRegistry } from '../registry.js';
import { fixtureV1FetchManifest } from './manifest.js';

const PAGE_URL = 'https://fixture-v1-fetch.invalid/page';
const REDIRECT_URL = 'https://fixture-v1-fetch.invalid/redirect';
const PAGE_REQUEST: WebFetchRequest = { url: PAGE_URL, format: 'markdown', timeoutMs: 30_000 };
const REDIRECT_REQUEST: WebFetchRequest = { url: REDIRECT_URL, format: 'text', timeoutMs: 10_000 };
const CAPABILITY: WebSearchCapability = { apiKey: '', fetch: vi.fn<typeof fetch>() };

describe('web fetch provider API v1 compatibility', () => {
  it('registers the frozen fetch fixture manifest', () => {
    expect(WEB_PROVIDER_API_VERSION).toBe(1);
    expect(fixtureV1FetchManifest.apiVersion).toBe(1);

    const registry = createProviderRegistry([fixtureV1FetchManifest]);

    expect(registry.fetchProviderNames()).toEqual(['fixture-v1-fetch']);
  });

  it('resolves the fixture for auto and by name', () => {
    const registry = createProviderRegistry([fixtureV1FetchManifest]);

    expect(registry.resolveFetchAttempts('auto', 'markdown', {}))
      .toEqual({ kind: 'attempts', manifests: [fixtureV1FetchManifest] });
    expect(registry.resolveFetchAttempts('fixture-v1-fetch', 'html', {}))
      .toEqual({ kind: 'attempts', manifests: [fixtureV1FetchManifest] });
  });

  it('round-trips a page through the frozen fetch fixture', async () => {
    const registry = createProviderRegistry([fixtureV1FetchManifest]);

    const outcome = await registry.runFetchAttempt(fixtureV1FetchManifest, PAGE_REQUEST, CAPABILITY);

    expect(outcome).toEqual({
      kind: 'fetched',
      url: PAGE_URL,
      content: 'The frozen fetch fixture page.',
    });
  });

  it('round-trips a redirect through the frozen fetch fixture', async () => {
    const registry = createProviderRegistry([fixtureV1FetchManifest]);

    const outcome = await registry.runFetchAttempt(fixtureV1FetchManifest, REDIRECT_REQUEST, CAPABILITY);

    expect(outcome).toEqual({
      kind: 'redirected',
      url: 'https://fixture-v1-fetch.invalid/target',
    });
  });
});
