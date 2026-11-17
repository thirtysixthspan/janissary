import type { ProjectTokens } from '../../project/tokens.js';
import type { WebSearchProviderManifest } from './contract.js';

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
