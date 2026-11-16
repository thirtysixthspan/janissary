# Web search providers

Janissary's web-search provider API is for trusted providers bundled in this repository. A provider answers one search: it receives a normalized query and a narrow capability object, sends one HTTP request, and returns a flat result list. It cannot be installed at runtime and is not sandboxed.

This is a separate family from [tab plugins](./tab-plugins.md), [editor plugins](./editor-plugins.md), and [overlay plugins](./overlay-plugins.md). Providers run on the server inside the Janissary process and share no catalog or API version with those families.

The authoritative types are `src/web-search/contract.ts`. The frozen `fixture-v1` provider and its compatibility test pin API version 1, so a change that breaks them is a breaking change by definition.

## Smallest working example

A provider is one manifest in `src/web-search/providers/catalog.ts` plus one module that exports `provider`.

The manifest is pure data:

```ts
export const fixtureV1Manifest = {
  id: 'fixture-v1',
  apiVersion: 1,
  token: 'tavily',
  activate: () => import('./provider.js'),
} as const satisfies WebSearchProviderManifest;
```

The module sends the query and returns results:

```ts
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
```

That is a complete provider: it sends the query to its own endpoint and returns two results.

## Files to add

For provider `example`, add `src/web-search/providers/example.ts` and any modules it needs beside it. Then add a manifest to `src/web-search/providers/catalog.ts` and include it in `webSearchProviderCatalog`:

```ts
export const exampleManifest = {
  id: 'example',
  apiVersion: WEB_SEARCH_PROVIDER_API_VERSION,
  token: 'tavily',
  activate: () => import('./example.js'),
} as const satisfies WebSearchProviderManifest;

export const webSearchProviderCatalog = [
  tavilyManifest,
  tinyfishManifest,
  exampleManifest,
] as const satisfies readonly WebSearchProviderManifest[];
```

**Never statically import the provider module from the catalog.** The catalog is read for every resolution, including a name the user typed and a search that never runs, so a static import would load every provider just to answer `--provider`. A literal dynamic import keeps the module unloaded until the first search that uses it. Node caches the resolved module, so later activations are cheap and the registry keeps no cache of its own.

## Manifest reference

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable lowercase identity, unique in the catalog and never `auto`. `--provider` matches it case-insensitively, and failure lines print it. |
| `apiVersion` | yes | The provider API version the module was written against. It must equal `WEB_SEARCH_PROVIDER_API_VERSION`, or the provider is refused before its module is imported. |
| `token` | yes | The `ProjectTokenName` of the token file whose value becomes `capability.apiKey`. |
| `activate` | yes | A literal dynamic import of the provider module. |

## The provider module

The module's one required export is `provider`:

```ts
type WebSearchRequest = {
  query: string;
  numResults: number;
  depth: 'basic' | 'advanced';
};

type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type WebSearchProvider = {
  search(
    request: WebSearchRequest,
    capability: WebSearchCapability,
  ): Promise<WebSearchResult[]>;
};
```

`search` receives the normalized request only. The character budget, the provider selection, and the fallback decision stay in the host. `numResults` is a request, not a guarantee: the host dedupes, cuts to the requested count, and renders the results after you return them.

Return an empty array when the search found nothing. That is an answer, not a failure, so the host does not fall back to another provider.

## The capability

`search` receives one capability object:

| Member | Meaning |
|---|---|
| `apiKey` | The value of the token file named by the manifest's `token`. A provider sees only its own key. |
| `fetch` | The request function to use. It is injected so tests run without the network. Do not reach for the global `fetch`. |
| `signal` | Optional. Aborted when the caller cancels the search. Pass it through to `fetch`. It is absent for a typed search, which has no cancellation. |

That is the whole vocabulary. A provider never reads token files, `Managers`, a tab, the remote channel, or any other host state. Each attempt gets a fresh capability built from that provider's token.

## Resolution and ordering

An explicit `--provider <name>` selects that one provider. `--provider auto`, the default, walks the catalog in order and skips any provider without a token file, then skips any provider already disabled. Names match case-insensitively, and `auto` is reserved.

The lines a provider author will see from resolution are:

- `Web search: unknown provider "<name>" (available: auto, tavily, tinyfish).`, with the name as typed and the catalog order after `auto`.
- `Web search: provider "<name>" is not configured.`, with the manifest id of a known provider that has no token file.
- `Web search: no provider configured.`, when `auto` has no provider with a token file.

Attempts run sequentially, each awaited before the next starts. There is no concurrency between providers. A provider that resolves results ends the search, including when it resolves an empty array.

## Validation and failure

A manifest's API version is checked before `activate` runs. A mismatch is a plugin failure with reason `requires provider API <n>`, where `<n>` is the version the manifest names. Nothing is imported.

Every call across the boundary is guarded. These are plugin failures:

- `activate` rejects or throws.
- The module has no `provider.search` function.
- `search` throws or rejects with anything other than a `ProviderRequestError`.
- `search` resolves to something that is not an array.

A plugin failure uses the reason `provider failed: <first line of the error>`, or one of the fixed reasons `provider failed: module has no provider` and `provider failed: search did not return an array`. The provider is disabled for the rest of the server process, and one notification appears: `Web search provider "<id>" disabled: <reason>.` Repeat failures keep the first reason and post no second notification. Nothing re-enables a provider except a server restart.

An expected failure is a thrown `ProviderRequestError`. Its message is the reason the host prints, and it never disables the provider. Use it for an HTTP status, a timeout, a network error, a response that doesn't decode, or anything else the provider's API can answer normally. An abort never disables either: when `capability.signal.aborted` is true, whatever the rejection is, the attempt is a cancellation and the host stops rather than falling back.

The 30-second budget is per attempt. The shared `requestJson` step in `src/web-search/providers/http.ts` joins `capability.signal` with a 30-second timeout, turns a non-2xx status into `HTTP <status> <status text>`, a timeout into `timed out after 30 s`, an undecodable body into `invalid response`, and a network failure into its first line. Use it unless a provider needs a request shape it cannot express. An `auto` search that falls back can take up to 30 seconds per configured provider.

## Trust and limits

Providers are trusted code running in the Janissary server process, not sandboxed. The capability object is a narrow seam and protection against mistakes, not a security boundary: a provider shares the process and could reach around it.

A provider may make network requests and read its own key. It has no file access, no `Managers`, no tabs, and no other host state. Providers are bundled only: there is no filesystem discovery, npm loading, or third-party installation.

## API version 1

`WEB_SEARCH_PROVIDER_API_VERSION` is 1. The frozen `fixture-v1` provider under `src/web-search/fixture-v1/` declares the literal `1` rather than the constant, so bumping the constant makes `src/web-search/fixture-v1/compatibility.test.ts` fail. That failure is the definition of a breaking change.

Additive changes that leave the fixture working are minor. Removing or changing anything the fixture exercises is a major bump: add a new fixture for the new version and keep the v1 fixture until version 1 is formally removed.
