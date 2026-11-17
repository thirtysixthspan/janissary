// The versioned provider contract for `web search` and `web fetch`. One provider is one plugin: a
// static manifest the registry reads without importing anything, and a lazily activated module
// whose `provider` implements `search`, `fetch`, or both, matching its declaration. A provider sees
// only the request and the narrow `WebSearchCapability`: its own API key (empty for a tokenless
// provider), a `fetch`, and the abort signal. It never reads token files, `Managers`, or any other
// host state.
//
// Declaration rules: a manifest that omits `search` searches; one whose `fetchFormats` is absent or
// empty does not fetch; and one with no `token` is always configured, with an empty `apiKey`.
//
// Extension point rules (`ai/guidelines/plugins.md` §5):
// - Search resolution: an explicit `--provider` chooses that one by its id; `auto` picks the first
//   configured provider in catalog order.
// - Search ordering and async: attempts run sequentially in resolution order, each awaited before
//   the next starts; they never run concurrently.
// - Search returning nothing: an empty array is a successful search with no results — an answer,
//   not a failure — so it never falls back to another provider.
// - Fetch resolution: an explicit `--provider` picks one fetch-capable provider by id and never
//   falls back. `auto` takes every fetch-capable, configured, enabled provider that serves the
//   requested format.
// - Fetch ordering: attempts follow catalog order.
// - Fetch async: attempts run one at a time, each awaited before the next.
// - Fetch returning nothing: an empty `content` string is an answer, not a failure. A
//   `{ redirectedTo }` result is an answer too, and never falls back.
// - Errors: a thrown `ProviderRequestError` is an expected failure (HTTP status, timeout, network
//   error, undecodable response) and carries the reason to print. Any other throw is a plugin
//   failure: the provider is disabled and the attempt moves on.
//
// `WEB_PROVIDER_API_VERSION` is the compatibility contract. It lives on the manifest and is
// checked before `activate` runs, so a provider written against another version is refused without
// its module being imported.

import type { ProjectTokenName } from '../../project/tokens.js';
import type { WebSearchDepth } from '../search/command.js';

export const WEB_PROVIDER_API_VERSION = 1;

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

export type WebFetchFormat = 'markdown' | 'text' | 'html';

export type WebFetchRequest = {
  url: string;
  format: WebFetchFormat;
  timeoutMs: number;
};

export type WebFetchPage = {
  url: string;
  content: string;
};

export type WebFetchRedirect = {
  redirectedTo: string;
};

export type WebFetchResult = WebFetchPage | WebFetchRedirect;

export type WebSearchCapability = {
  apiKey: string;
  fetch: typeof fetch;
  signal?: AbortSignal;
};

export type WebSearchProvider = {
  search?: (
    request: WebSearchRequest,
    capability: WebSearchCapability,
  ) => Promise<WebSearchResult[]>;
  fetch?: (
    request: WebFetchRequest,
    capability: WebSearchCapability,
  ) => Promise<WebFetchResult>;
};

export type WebSearchProviderModule = {
  provider: WebSearchProvider;
};

export type WebSearchProviderManifest = {
  id: string;
  apiVersion: number;
  token?: ProjectTokenName;
  search?: boolean;
  fetchFormats?: readonly WebFetchFormat[];
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
