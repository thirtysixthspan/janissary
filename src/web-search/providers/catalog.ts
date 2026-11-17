import { WEB_SEARCH_PROVIDER_API_VERSION } from '../contract.js';
import type { WebSearchProviderManifest } from '../contract.js';

export const tavilyManifest = {
  id: 'tavily',
  apiVersion: WEB_SEARCH_PROVIDER_API_VERSION,
  token: 'tavily',
  activate: () => import('./tavily.js'),
} as const satisfies WebSearchProviderManifest;

export const tinyfishManifest = {
  id: 'tinyfish',
  apiVersion: WEB_SEARCH_PROVIDER_API_VERSION,
  token: 'tinyfish',
  activate: () => import('./tinyfish.js'),
} as const satisfies WebSearchProviderManifest;

export const webSearchProviderCatalog = [
  tavilyManifest,
  tinyfishManifest,
] as const satisfies readonly WebSearchProviderManifest[];
