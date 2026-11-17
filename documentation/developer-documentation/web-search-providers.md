# Web search providers

Janissary's web-search provider API is for trusted providers bundled in this repository. A provider answers one search: it receives a normalized query and a narrow capability object, sends one HTTP request, and returns a flat result list. It cannot be installed at runtime and is not sandboxed.

This is a separate family from [tab plugins](./tab-plugins.md), [editor plugins](./editor-plugins.md), and [overlay plugins](./overlay-plugins.md). Providers run on the server inside the Janissary process and share no catalog or API version with those families.

The authoritative types are `src/web/providers/contract.ts`. The frozen `fixture-v1` provider and its compatibility test pin API version 1, so a change that breaks them is a breaking change by definition.

## Smallest working example

A provider is one manifest in `src/web/providers/catalog.ts` plus one module that exports `provider`.

The manifest is pure data:

```ts
export const fixtureV1Manifest = {
  id: 'fixture-v1',
  apiVersion: 1,
  token: 'tavily',
  activate: () => import('./provider.js'),
} as const satisfies WebSearchProviderManifest;
```

`fixture-v1` is the frozen test provider, so its `token: 'tavily'` is a stand-in whose value the compatibility test supplies. A real provider names its own token row, as [Token rows](#token-rows) describes.

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

For provider `example`, add `src/web/providers/example.ts` and any modules it needs beside it. Then add a manifest to `src/web/providers/catalog.ts` and include it in `webSearchProviderCatalog`. Its `token` names the provider's own row in `PROJECT_TOKENS`, added as described in [Token rows](#token-rows); reusing another provider's name would hand the new provider that service's key:

```ts
export const exampleManifest = {
  id: 'example',
  apiVersion: WEB_PROVIDER_API_VERSION,
  token: 'example', // the placeholder row added in "Token rows"
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
| `apiVersion` | yes | The provider API version the module was written against. It must equal `WEB_PROVIDER_API_VERSION`, or the provider is refused before its module is imported. |
| `token` | no | The `ProjectTokenName` of the token file whose value becomes `capability.apiKey`. A provider without one is always configured and gets an empty `apiKey`. A new provider needs its own row; see [Token rows](#token-rows). |
| `search` | no | Whether the provider searches. Absent means it does; only `search: false` opts out. |
| `fetchFormats` | no | The fetch formats the provider serves: `markdown`, `text`, or `html`. Absent or empty means no fetch. |
| `activate` | yes | A literal dynamic import of the provider module. |

## Token rows

`token` names a row in `PROJECT_TOKENS` in `src/project/tokens.ts`. The row's `file` is the `.janissary/` file read for the value, and its `env` lists the variables the value would be set under in a spawned process. A new provider needs a new row, never an existing one: `token: 'tavily'` in a provider of your own would hand it Tavily's key, and `auto` would treat that provider as configured whenever the Tavily token file exists.

A search provider's key is read by the Janissary process, which runs the search. No spawned process reads it, so the row sets `spawn: false`: the key is still loaded at startup and still forwarded to a remote machine, but no workspaced shell, harness, or ACP agent is handed it, and an ambient copy is scrubbed. A row that omits `spawn` defaults to true, which is right for a credential a spawned process needs.

Add the `example` row beside the others:

```ts
{
  name: 'example',
  file: 'example-token',
  env: ['EXAMPLE_API_KEY'],
  spawn: false,
},
```

`name` must be unique in the table and is the value `token` carries, and `file` must be a file no other row reads. `env` lists the environment variables the credential would be set under for a spawned process; a search row keeps the list even though `spawn: false` keeps it out of every spawn. The `'example'` value in the snippets on this page is a placeholder for this row; it is not a `ProjectTokenName` until the row exists.

Adding a row is not only this table. The specs that enumerate the token files — `product/specs/workspaced-agent.md`, `product/specs/sandbox.md`, `product/specs/remote-server.md`, `product/specs/acp.md`, and `product/specs/web-search.md` today — need the new file wherever they list the existing ones, as do the user documentation table in `documentation/user-documentation/advanced-agents/tokens.md`, `help/web.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`. Every new row also moves `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`, with no row exempt: `getProjectTokens()` in `src/project/tokens.ts` supplies every configured row to the remote `provision` frame that `src/remote/entry-factory.ts` sends, and `src/remote/serve-provision.ts` merges the forwarded map for the workspace clone, the processes, and ACP. A remote decodes that map against its own `PROJECT_TOKENS` table, and `src/remote/frame/decode-provision.ts` rejects an unknown name by failing the whole provisioning request, so a row a peer does not know breaks provisioning rather than merely going unused.

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
  search?(
    request: WebSearchRequest,
    capability: WebSearchCapability,
  ): Promise<WebSearchResult[]>;
};
```

A provider implements `search`, `fetch`, or both, matching what its manifest declares. `search` receives the normalized request only. The character budget, the provider selection, and the fallback decision stay in the host. `numResults` is a request, not a guarantee: the host dedupes, cuts to the requested count, and renders the results after you return them.

Return an empty array when the search found nothing. That is an answer, not a failure, so the host does not fall back to another provider.

## The capability

`search` receives one capability object:

| Member | Meaning |
|---|---|
| `apiKey` | The value of the token file named by the manifest's `token`. A provider sees only its own key. It is empty when the manifest names no token. |
| `fetch` | The request function to use. It is injected so tests run without the network. Do not reach for the global `fetch`. |
| `signal` | Optional. Aborted when the caller cancels the search. Pass it through to `fetch`. It is absent for a typed search, which has no cancellation. |

That is the whole vocabulary. A provider never reads token files, `Managers`, a tab, the remote channel, or any other host state. Each attempt gets its own request object and a fresh capability built from that provider's token, so a provider that mutates what it receives changes only its own copy and never what a later fallback provider gets.

## Resolution and ordering

An explicit `--provider <name>` selects that one search-capable provider, checked in the order unknown, then disabled, then not configured. `--provider auto`, the default, walks the search-capable providers in catalog order and skips any provider that names a token with no token file, then skips any provider already disabled. A provider whose manifest sets `search: false` is unknown to `web search`, even when named explicitly or already disabled, and is absent from the `available:` list. Names match case-insensitively, and `auto` is reserved.

The lines a provider author will see from resolution are:

- `Web search: unknown provider "<name>" (available: auto, tavily, tinyfish).`, with the name as typed and the catalog order after `auto`.
- `Web search: provider "<name>" is not configured.`, with the manifest id of a known provider that has no token file.
- `Web search: no provider configured.`, when `auto` has no provider with a token file.
- `Web search failed (<id>): <reason>.`, for an explicit `--provider` naming a disabled provider, and for `auto` when its one configured provider is disabled. `<reason>` is the stored reason from the failure that disabled it.
- `Web search: every provider failed.` followed by one `- <id>: <reason>` line for each provider, in catalog order, when `auto` has two or more configured providers and all of them are disabled.

Both disabled-provider forms come from `formatFailures` in `src/web/providers/failure-lines.ts`, the one function every web search and web fetch failure line goes through, so a disabled provider and one that just failed read identically. It takes the command's headings, which is how the same function prints `Web search failed ...` and `Web fetch failed ...` lines. `resolveSearchAttempts` in `src/web/providers/search-resolution.ts` decides which line a search starts with; read it for the exact conditions.

Fetch resolution walks the same kind of ordering over a smaller set. Only providers with a non-empty `fetchFormats` take part, so a search-only provider is never attempted. `--provider auto` walks the fetch-capable providers in catalog order and skips any that names a token with no token file, any that does not list the requested `--format`, and any already disabled. When every provider left is disabled, their stored reasons print through `formatFailures` with `WEB_FETCH_FAILURE_HEADINGS`: one provider gives `Web fetch failed (<id>): <reason>.`, and several give `Web fetch: every attempt failed.` followed by one `- <id>: <reason>` line each in catalog order. When nothing is eligible, the line is `Web fetch: no provider configured.`. `resolveFetchAttempts` in `src/web/providers/fetch-resolution.ts` has the exact conditions.

Attempts run sequentially, each awaited before the next starts. There is no concurrency between providers. A provider that resolves results ends the search, including when it resolves an empty array.

## Validation and failure

A manifest's API version is checked before `activate` runs. A mismatch is a plugin failure with reason `requires provider API <n>`, where `<n>` is the version the manifest names. Nothing is imported.

Every call across the boundary is guarded. These are plugin failures:

- `activate` rejects or throws, whatever the error type. An activation failure always disables, including one that throws a `ProviderRequestError`: a module that cannot import has not made a request, so there is no expected answer to report.
- The module has no `provider.search` function.
- `search` throws or rejects with anything other than a `ProviderRequestError`.
- `search` resolves to something that is not an array.

A plugin failure uses the reason `provider failed: <first line of the error>`, or one of the fixed reasons `provider failed: module has no provider` and `provider failed: search did not return an array`. The provider is disabled for the rest of the server process. A local search that supplies `reportDisabled` posts one notification: `Web search provider "<id>" disabled: <reason>.` Repeat failures keep the first reason and post no second notification. A search on a remote machine passes no `reportDisabled`, so no notification appears there, and it prints only the provider that answered, so a provider disabled during a successful fallback is reported nowhere until a later failure line names it: an explicit search of it, or `auto` once every configured provider is disabled. Nothing re-enables a provider except a server restart.

A `search` that throws a `ProviderRequestError` is an expected failure. Its message is the reason the host prints, and it never disables the provider. Use it for an HTTP status, a timeout, a network error, a response that doesn't decode, or anything else the provider's API can answer normally. An `auto` search records the failure and moves on to the next configured provider, while an explicit `--provider` tries only that provider, so its expected failure prints a single `Web search failed (<id>): <reason>.` line. An abort never disables either: when `capability.signal.aborted` is true, whatever the rejection is, the attempt is a cancellation and the search stops rather than falling back to the next provider. Once the caller's signal aborts, the search rejects with the abort instead of printing a failure or resolution line, including when the abort lands before any attempt starts or on the final provider's failure.

The 30-second budget is per attempt. The shared `requestJson` step in `src/web/providers/http.ts` joins `capability.signal` with a 30-second timeout, turns a non-2xx status into `HTTP <status> <status text>`, a timeout into `timed out after 30 s`, an undecodable body into `invalid response`, and a network failure into its first line. Use it unless a provider needs a request shape it cannot express. An `auto` search that falls back can take up to 30 seconds per configured provider.

## Trust and limits

Providers are trusted code running in the Janissary server process, not sandboxed. The capability object is a narrow seam and protection against mistakes, not a security boundary: a provider shares the process and could reach around it.

A provider may make network requests and read its own key. It has no file access, no `Managers`, no tabs, and no other host state. Providers are bundled only: there is no filesystem discovery, npm loading, or third-party installation.

## API version 1

`WEB_PROVIDER_API_VERSION` is 1. The frozen `fixture-v1` provider under `src/web/providers/fixture-v1/` declares the literal `1` rather than the constant, so bumping the constant makes `src/web/providers/fixture-v1/compatibility.test.ts` fail. That failure is the definition of a breaking change.

Additive changes that leave the fixture working are minor. Removing or changing anything the fixture exercises is a major bump: add a new fixture for the new version and keep the v1 fixture until version 1 is formally removed.
