import { PROVIDER_TIMEOUT_MS } from '../../models/providers/result.js';
import type { WebSearchProvider } from './contract.js';
import { decodeTinyFishPage } from './decode-fetch.js';
import { decodeResults } from './decode.js';
import { requestJson } from './http.js';

const SEARCH_URL = 'https://api.search.tinyfish.ai';
const FETCH_URL = 'https://api.fetch.tinyfish.ai';
const MAX_FETCH_TIMEOUT_MS = 110_000;

export const provider = {
  async search(request, capability) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('query', request.query);
    const body = await requestJson(
      capability,
      url,
      {
        method: 'GET',
        headers: { 'X-API-Key': capability.apiKey },
      },
      PROVIDER_TIMEOUT_MS,
    );
    return decodeResults(body, 'snippet');
  },
  async fetch(request, capability) {
    const body = await requestJson(
      capability,
      FETCH_URL,
      {
        method: 'POST',
        headers: {
          'X-API-Key': capability.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: [request.url],
          format: request.format,
          ttl: 0,
          per_url_timeout_ms: Math.min(request.timeoutMs, MAX_FETCH_TIMEOUT_MS),
        }),
      },
      request.timeoutMs,
    );
    return decodeTinyFishPage(body, request.url);
  },
} satisfies WebSearchProvider;
