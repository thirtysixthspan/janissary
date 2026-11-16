// The versioned provider contract for `web search`. One provider is one plugin: a static manifest
// the registry reads without importing anything, and a lazily activated module whose `provider`
// implements one normalized `search`. A provider sees only the request and the narrow
// `WebSearchCapability` — its own API key, a `fetch`, and the abort signal — and never reads token
// files, `Managers`, or any other host state.
//
// Extension point rules (`ai/guidelines/plugins.md` §5):
// - Resolution: an explicit `--provider` chooses that one by its id; `auto` picks the first
//   provider in catalog order whose token is configured.
// - Ordering and async: attempts run sequentially in resolution order, each awaited before the
//   next starts; they never run concurrently.
// - Returning nothing: an empty array is a successful search with no results — an answer, not a
//   failure — so it never falls back to another provider.
// - Errors: a thrown `ProviderRequestError` is an expected failure (HTTP status, timeout, network
//   error, undecodable response) and carries the reason to print. Any other throw is a plugin
//   failure: the provider is disabled and the search moves on.
//
// `WEB_SEARCH_PROVIDER_API_VERSION` is the compatibility contract. It lives on the manifest and is
// checked before `activate` runs, so a provider written against another version is refused without
// its module being imported.

import type { ProjectTokenName } from '../project/tokens.js';
import type { WebSearchDepth } from './command.js';

export const WEB_SEARCH_PROVIDER_API_VERSION = 1;

export type WebSearchRequest = {
  query: string;
  numResults: number;
  depth: WebSearchDepth;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchCapability = {
  apiKey: string;
  fetch: typeof fetch;
  signal?: AbortSignal;
};

export type WebSearchProvider = {
  search: (
    request: WebSearchRequest,
    capability: WebSearchCapability,
  ) => Promise<WebSearchResult[]>;
};

export type WebSearchProviderModule = {
  provider: WebSearchProvider;
};

export type WebSearchProviderManifest = {
  id: string;
  apiVersion: number;
  token: ProjectTokenName;
  activate: () => Promise<WebSearchProviderModule>;
};

// Thrown by a provider for one expected failure. The reason is the line the core prints unchanged,
// such as `HTTP 429 Too Many Requests`, `timed out after 30 s`, `invalid response`, or a network
// error's first line. A throw of any other type means the plugin itself failed.
export class ProviderRequestError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ProviderRequestError';
  }
}
