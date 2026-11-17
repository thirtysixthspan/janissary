import { describe, expect, it, vi } from 'vitest';
import { WEB_PROVIDER_API_VERSION } from '../contract.js';
import type { WebSearchCapability, WebSearchRequest, WebSearchResult } from '../contract.js';
import { createProviderRegistry } from '../registry.js';
import { fixtureV1Manifest } from './manifest.js';

const REQUEST: WebSearchRequest = { query: 'node.js', numResults: 2, depth: 'basic' };

const EXPECTED_RESULTS: WebSearchResult[] = [
  {
    title: 'node.js',
    url: 'https://fixture-v1.invalid/one',
    snippet: 'The first frozen fixture result.',
  },
  {
    title: 'Fixture result two',
    url: 'https://fixture-v1.invalid/two',
    snippet: 'The second frozen fixture result.',
  },
];

describe('web search provider API v1 compatibility', () => {
  it('registers the frozen fixture manifest', () => {
    expect(WEB_PROVIDER_API_VERSION).toBe(1);
    expect(fixtureV1Manifest.apiVersion).toBe(1);

    const registry = createProviderRegistry([fixtureV1Manifest]);

    expect(registry.searchProviderNames()).toEqual(['fixture-v1']);
    expect(registry.resolveAttempts('fixture-v1', { tavily: 'k' }))
      .toEqual({ kind: 'attempts', manifests: [fixtureV1Manifest] });
  });

  it('round-trips a representative search through the frozen fixture', async () => {
    const controller = new AbortController();
    let receivedUrl: URL | undefined;
    let receivedInit: RequestInit | undefined;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      receivedUrl = new URL(String(input));
      receivedInit = init;
      return Response.json({ ignored: true });
    });
    const capability: WebSearchCapability = {
      apiKey: 'k',
      fetch: fetcher,
      signal: controller.signal,
    };
    const registry = createProviderRegistry([fixtureV1Manifest]);

    const outcome = await registry.runAttempt(fixtureV1Manifest, REQUEST, capability);

    expect(outcome).toEqual({ kind: 'results', results: EXPECTED_RESULTS });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(receivedUrl?.href).toBe('https://fixture-v1.invalid/search?q=node.js');
    expect(new Headers(receivedInit?.headers).get('authorization')).toBe('Bearer k');
    expect(receivedInit?.signal).toBe(controller.signal);
  });
});
