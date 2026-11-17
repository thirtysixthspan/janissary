import type { ProjectTokens } from '../../project/tokens.js';
import type { WebFetchFormat, WebSearchProviderManifest } from './contract.js';

export function searchesWeb(manifest: WebSearchProviderManifest): boolean {
  return manifest.search ?? !fetchesWeb(manifest);
}

export function fetchesWeb(manifest: WebSearchProviderManifest): boolean {
  return manifest.fetchFormats !== undefined && manifest.fetchFormats.length > 0;
}

export function servesFetchFormat(
  manifest: WebSearchProviderManifest,
  format: WebFetchFormat,
): boolean {
  return manifest.fetchFormats?.includes(format) ?? false;
}

export function isConfigured(manifest: WebSearchProviderManifest, tokens: ProjectTokens): boolean {
  const { token } = manifest;
  if (token === undefined) return true;
  const value = tokens[token];
  return typeof value === 'string' && value !== '';
}

export function providerApiKey(manifest: WebSearchProviderManifest, tokens: ProjectTokens): string {
  const { token } = manifest;
  if (token === undefined) return '';
  return tokens[token] ?? '';
}
