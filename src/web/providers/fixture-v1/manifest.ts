import type { WebSearchProviderManifest } from '../contract.js';

export const fixtureV1Manifest = {
  id: 'fixture-v1',
  apiVersion: 1,
  token: 'tavily',
  activate: () => import('./provider.js'),
} as const satisfies WebSearchProviderManifest;
