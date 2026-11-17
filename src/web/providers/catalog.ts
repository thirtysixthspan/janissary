import { WEB_PROVIDER_API_VERSION } from './contract.js';
import type { WebSearchProviderManifest } from './contract.js';

export const tavilyManifest = {
  id: 'tavily',
  apiVersion: WEB_PROVIDER_API_VERSION,
  search: true,
  fetchFormats: ['markdown', 'text'],
  token: 'tavily',
  activate: () => import('./tavily.js'),
} as const satisfies WebSearchProviderManifest;

export const tinyfishManifest = {
  id: 'tinyfish',
  apiVersion: WEB_PROVIDER_API_VERSION,
  search: true,
  fetchFormats: ['markdown', 'html'],
  token: 'tinyfish',
  activate: () => import('./tinyfish.js'),
} as const satisfies WebSearchProviderManifest;

export const localManifest = {
  id: 'local',
  apiVersion: WEB_PROVIDER_API_VERSION,
  search: false,
  fetchFormats: ['markdown', 'text', 'html'],
  activate: () => import('./local.js'),
} as const satisfies WebSearchProviderManifest;

export const webProviderCatalog = [
  tavilyManifest,
  tinyfishManifest,
  localManifest,
] as const satisfies readonly WebSearchProviderManifest[];
