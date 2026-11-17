import type { WebSearchProvider } from './contract.js';
import { decodeResults } from './decode.js';
import { requestJson } from './http.js';

const SEARCH_URL = 'https://api.tavily.com/search';

export const provider = {
  async search(request, capability) {
    const body = await requestJson(capability, SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${capability.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: request.query,
        max_results: request.numResults,
        search_depth: request.depth,
        topic: 'general',
      }),
    });
    return decodeResults(body, 'content');
  },
} satisfies WebSearchProvider;
