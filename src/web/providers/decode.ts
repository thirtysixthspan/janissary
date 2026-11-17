import { isRecord } from '../../value-guards.js';
import { ProviderRequestError, type WebSearchResult } from './contract.js';

export function decodeResults(body: unknown, snippetKey: 'content' | 'snippet'): WebSearchResult[] {
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new ProviderRequestError('invalid response');
  }
  const results: WebSearchResult[] = [];
  for (const entry of body.results) {
    if (!isRecord(entry) || typeof entry.url !== 'string') continue;
    results.push({
      title: text(entry.title),
      url: entry.url,
      snippet: text(entry[snippetKey]),
    });
  }
  return results;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
