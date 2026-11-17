import type { WebSearchProvider } from '../contract.js';

const REDIRECT_SOURCE = 'https://fixture-v1-fetch.invalid/redirect';
const REDIRECT_TARGET = 'https://fixture-v1-fetch.invalid/target';

export const provider: WebSearchProvider = {
  async fetch(request) {
    if (request.url === REDIRECT_SOURCE) {
      return { redirectedTo: REDIRECT_TARGET };
    }
    return { url: request.url, content: 'The frozen fetch fixture page.' };
  },
};
