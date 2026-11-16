import type { WebSearchProvider } from '../contract.js';

export const provider: WebSearchProvider = {
  async search(request, capability) {
    const url = new URL('https://fixture-v1.invalid/search');
    url.searchParams.set('q', request.query);
    await capability.fetch(url, {
      headers: { Authorization: `Bearer ${capability.apiKey}` },
      signal: capability.signal,
    });
    return [
      {
        title: request.query,
        url: 'https://fixture-v1.invalid/one',
        snippet: 'The first frozen fixture result.',
      },
      {
        title: 'Fixture result two',
        url: 'https://fixture-v1.invalid/two',
        snippet: 'The second frozen fixture result.',
      },
    ];
  },
};
