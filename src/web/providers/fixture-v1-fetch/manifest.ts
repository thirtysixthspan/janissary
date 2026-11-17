import type { WebSearchProviderManifest } from '../contract.js';

export const fixtureV1FetchManifest = {
  id: 'fixture-v1-fetch',
  apiVersion: 1,
  search: false,
  fetchFormats: ['markdown', 'text', 'html'],
  activate: () => import('./provider.js'),
} as const satisfies WebSearchProviderManifest;
