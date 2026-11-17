import { PROVIDER_TIMEOUT_MS } from '../../models/providers/result.js';
import type { WebSearchCapability, WebSearchProvider } from './contract.js';
import { decodeTavilyPage } from './decode-fetch.js';
import { decodeResults } from './decode.js';
import { requestJson } from './http.js';

const SEARCH_URL = 'https://api.tavily.com/search';
const EXTRACT_URL = 'https://api.tavily.com/extract';
const MAX_EXTRACT_TIMEOUT_S = 60;

export const provider = {
  async search(request, capability) {
    const body = await postJson(
      capability,
      SEARCH_URL,
      {
        query: request.query,
        max_results: request.numResults,
        search_depth: request.depth,
        topic: 'general',
      },
      PROVIDER_TIMEOUT_MS,
    );
    return decodeResults(body, 'content');
  },
  async fetch(request, capability) {
    const body = await postJson(
      capability,
      EXTRACT_URL,
      {
        urls: [request.url],
        format: request.format,
        extract_depth: 'basic',
        timeout: Math.min(request.timeoutMs / 1000, MAX_EXTRACT_TIMEOUT_S),
      },
      request.timeoutMs,
    );
    return decodeTavilyPage(body, request.url);
  },
} satisfies WebSearchProvider;

async function postJson(
  capability: WebSearchCapability,
  url: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return requestJson(
    capability,
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${capability.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}
