import type { WebSearchProvider } from './contract.js';
import { decodeResults } from './decode.js';
import { requestJson } from './http.js';

const SEARCH_URL = 'https://api.search.tinyfish.ai';

export const provider = {
  async search(request, capability) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('query', request.query);
    const body = await requestJson(capability, url, {
      method: 'GET',
      headers: { 'X-API-Key': capability.apiKey },
    });
    return decodeResults(body, 'snippet');
  },
} satisfies WebSearchProvider;
