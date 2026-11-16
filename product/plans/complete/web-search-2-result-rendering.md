# Web search 2: the provider contract types and the result rendering pipeline

**Complexity: 6/10** — ~140 added lines, 18 requirements, 20 test scenarios, no existing files edited (p=5.92)

The second slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds the versioned, import-free provider plugin contract (`src/web-search/contract.ts`) and the pure rendering pipeline (`src/web-search/render.ts`) that turns a provider's flat result list into the one plain-text context string both the typed command and the agent tool print. No provider, registry, or I/O lands here; the search core (`./product/plans/ready/web-search-6-search-core.md`) wires these together. Later slices import these names as written here: the bundled providers (`./product/plans/ready/web-search-4-bundled-providers.md`), the registry and fixture (`./product/plans/ready/web-search-5-provider-registry.md`), and the core.

## Dependencies

- `./product/plans/ready/web-search-1-command-grammar.md` — `WebSearchDepth` (`'basic' | 'advanced'`), exported from `src/web-search/command.ts`, for the request type. That slice must land first; `src/web-search/` does not exist yet.
- `src/project/tokens.ts` (`ProjectTokenName`, line 66) already exists. The `tavily` and `tinyfish` rows arrive in `./product/plans/ready/web-search-3-provider-tokens.md`; this slice only uses the type, so it does not wait for them.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Provider contract (feature text, extended by user decision).** Each provider is a plugin implementing one normalized `search({ query, numResults, depth })` returning a flat list of `{ title, url, snippet }`. Callers never see a provider's response shape.
- **Contract module.** `contract.ts` is versioned and import-free so a fixture can be written against it: `WEB_SEARCH_PROVIDER_API_VERSION` (1); `WebSearchRequest` (`query`, `numResults`, `depth: 'basic' | 'advanced'`); `WebSearchResult` (`title`, `url`, `snippet`); `WebSearchCapability` (`apiKey`, `fetch`, `signal`); `WebSearchProvider` (`search(request, capability)` resolving to `WebSearchResult[]`); `WebSearchProviderManifest` (`id`, `apiVersion`, `token` — a `ProjectTokenName` — and `activate()` resolving to the module's provider); the API version lives on the manifest only, so it is checked before anything is imported; and `ProviderRequestError`, the one error type a provider throws for an expected failure (HTTP status, timeout, network error, undecodable response) carrying its failure reason. "Import-free" means no runtime imports; the `ProjectTokenName` and `WebSearchDepth` references are type-only imports (`import type`).
- **Field types (decision).** `WebSearchRequest`: `query: string`, `numResults: number`, `depth: WebSearchDepth`. `WebSearchResult`: `title: string`, `url: string`, `snippet: string`, all required (a provider passes `''` for a missing title or snippet). `WebSearchCapability`: `apiKey: string`, `fetch: typeof fetch`, `signal?: AbortSignal` — optional because a typed search has no cancellation (the core passes `deps.signal`, which may be undefined). `WebSearchProviderManifest`: `id: string`, `apiVersion: number`, `token: ProjectTokenName`, `activate: () => Promise<WebSearchProviderModule>`.
- **Module shape (decision).** `activate()` resolves to a provider module, `WebSearchProviderModule`, whose one required member is a named export `provider: WebSearchProvider`. This is what `() => import('./tavily.js')` resolves to, so each provider module in `./product/plans/ready/web-search-4-bundled-providers.md` exports `provider` and the catalog in `./product/plans/ready/web-search-5-provider-registry.md` needs no adapter. This settles that slice's "for example a `provider` named export".
- **`ProviderRequestError` (decision).** A class extending `Error` whose constructor takes the reason string, stores it as `message`, and sets `name` to `'ProviderRequestError'`, exactly like `TabPluginRejection` at `src/plugins/api-capabilities.ts:125`. The registry recognizes it with `instanceof`. It carries nothing else (no status field): the reason text is all the core prints.
- **Contract header (`ai/guidelines/plugins.md` §5).** The module's header comment documents the four things §5 requires: resolution is by name or by first-configured in catalog order; attempts run sequentially with each awaited, never concurrently; an empty array means a successful search with no results (an answer, not a failure, so no fallback); and a thrown `ProviderRequestError` is an expected failure while any other throw is a plugin failure that disables the provider. It also states that the API version lives on the manifest and is checked before `activate` runs.
- **Provider capability (from `ai/guidelines/plugins.md` §1).** A provider's `search` receives the normalized request and a narrow capability object: its own API key, a `fetch` function, and the abort signal. It never reads token files, `Managers`, or any other host state.
- **Core pipeline (feature text).** The core stays provider-agnostic: it removes duplicates, orders by relevance, and truncates the rendered text to the character budget.
- **Relevance order (from the contract).** The provider contract returns results in the provider's own relevance order and carries no score, so the core keeps that order; there is no re-ranking.
- **Output (feature text).** One plain-text context string: a relevance-ordered list rendering each result's title, URL, and snippet inline, formatted for direct insertion into a session prompt.
- **Output format (user decision).** A Markdown list with no header line: each result is a `- [<title>](<url>)` line followed by its snippet on the next line, indented two spaces.
- **Layout details (decision).** Lines are joined with a single `\n`; there is no blank line between results and no trailing newline. The truncation note, when present, is the last line, after one `\n`. A result whose normalized snippet is empty renders its link line only, with no snippet line. Lengths are JavaScript string lengths (`.length`), newlines included, and `…` (U+2026) counts as one.
- **Normalizing results (user decision).** Before rendering, every run of whitespace (newlines included) in a title or snippet becomes one space and the ends are trimmed; `[`, `]`, and `\` in a title are backslash-escaped; spaces and parentheses in a URL are percent-encoded; an empty title is replaced by the URL. A result whose URL is not an absolute `http:` or `https:` URL is dropped and does not count toward the result total.
- **Normalize order (decision).** Per result: parse and encode the URL first (dropping the result if invalid); collapse and trim the title; if it is empty, use the encoded URL as the title; then escape the title in one pass that prefixes each `[`, `]`, and `\` with a backslash (so an escape is never itself re-escaped). The fallback title is escaped too, because an IPv6 host such as `http://[::1]/` contains brackets. Snippets are only collapsed and trimmed, never escaped.
- **URL handling.** Each URL is parsed with the WHATWG `URL` constructor, dropped when it throws or its `protocol` is not `http:`/`https:`, and taken as its `href` with `(` and `)` additionally percent-encoded (`%28`, `%29`), since `URL` already encodes spaces (verified: `new URL('https://example.com/a b(c)').href` is `https://example.com/a%20b(c)`, so parentheses need the extra step).
- **Duplicates (user decision).** Two results are duplicates when their URLs match after lowercasing the scheme and host, dropping the `#fragment`, and dropping one trailing `/` from the path; query strings are kept. The first, higher-ranked occurrence is kept.
- **Dedupe key (decision).** `dedupeResults` runs on normalized results and builds the key from a fresh `URL` of the normalized `url`: `hash` set to `''`, then, when `pathname` ends with `/`, `pathname` set to itself minus that one `/`; the key is the resulting `href`. Strip through `pathname`, never by trimming the `href` string, so `https://e.com/a/?q=1` and `https://e.com/a?q=1` match. `URL` has already lowercased scheme and host and dropped a default port. Setting a root path of `/` to `''` leaves it `/`, so `https://e.com` and `https://e.com/` share a key. Because the key comes from the normalized URL, `https://e.com/(x)` and `https://e.com/%28x%29` are duplicates. The kept result keeps its own `url`; the key is not shown.
- **Truncation (user decision).** The output keeps as many whole results as fit within `--max-chars`, in order, and when any were left out ends with the line `(showing <k> of <n> results; raise --max-chars for more)`; the budget includes that line. When even the first result does not fit, its snippet is cut and ends with `…` so that at least one result's title and URL always appear; if the first result's link line alone is longer than the budget, it is printed whole anyway, with no snippet.
- **Truncation details (decision).** `k` is the largest count of leading whole results whose rendering, plus `\n` and the note when `k < n`, is at most `maxChars`; the note's length is computed for that `k`. When `k` is 0, the output is the first result with its snippet cut, and `k` in the note is 1 (the note appears only when `n > 1`). The snippet room is `maxChars` minus the link line, minus 3 for `\n` and the two-space indent, minus `\n` plus the note when there is one; the snippet keeps its first `room − 1` characters with trailing whitespace trimmed, then `…`. A cut never ends on a lone high surrogate (drop it). When the room leaves no snippet character, the snippet line is omitted, the link line is printed whole, and the note still follows when `n > 1`; that is the only case the output can exceed `maxChars`.
- **`total` (decision).** `renderResults(results, total, maxChars)` uses `total` verbatim as `<n>` and `results.length` as the candidates for `<k>`. Its only caller, the core, passes `results.length` after normalizing, deduping, and cutting to `numResults` (`./product/plans/ready/web-search-6-search-core.md`), so `<n>` counts the cut list, not the provider's raw count. The signature keeps `total` separate as the source plan names it. Called with an empty list it returns `''`; the core never does, because it prints `No results for "<query>".` instead.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| URL parsing | WHATWG `URL` (Node global) | The http/https check, and the dedupe key: `URL` already lowercases scheme and host, percent-encodes spaces, and exposes `hash` and `pathname` to rewrite. |
| Project token names | `src/project/tokens.ts:66` (`export type ProjectTokenName`) | The manifest's `token` field type, imported with `import type`. |
| Search depth | `src/web-search/command.ts` (`WebSearchDepth`, from `./product/plans/ready/web-search-1-command-grammar.md`) | `WebSearchRequest.depth`, imported with `import type`. |
| Plugin contract precedent | `src/plugins/api.ts`, `src/plugins/api-capabilities.ts` (`TAB_PLUGIN_API_VERSION`, `TabPluginRejection`) | Shape of a versioned contract module with its header documenting the extension point; `TabPluginRejection` is the model for `ProviderRequestError`. |

## Proposed changes

- **`src/web-search/contract.ts`** (new) — the types, constant, and `ProviderRequestError` class listed under Design decisions, plus `WebSearchProviderModule`, with the §5 header. Its only runtime contents are the constant and the class. `ProviderRequestError` carries its reason as `message` (for example `HTTP 429 Too Many Requests`, `timed out after 30 s`, `invalid response`, or a network error's first line) so the core can print it unchanged. About 50 counted lines.
- **`src/web-search/render.ts`** (new) — pure functions over `WebSearchResult[]`, importing only the `WebSearchResult` type from `./contract.js`:
  - `normalizeResults(results)` — whitespace collapse, title escaping, empty-title fallback, URL validation and encoding; drops invalid URLs; returns new objects and does not mutate its input.
  - `dedupeResults(results)` — keeps the first occurrence of each dedupe key, preserving order.
  - `renderResults(results, total, maxChars)` — the Markdown list, the truncation note, and the first-result snippet cut.
  - Keep each exported function under the `sonarjs/cognitive-complexity` limit (~15) by giving the per-result rendering, the whole-result fit, and the first-result cut their own unexported helpers. Expected size is about 90 counted lines, well under `max-lines`; the whitespace pattern is a simple `/\s+/g`, which `security/detect-unsafe-regex` accepts.
- Until later slices consume them, every export is imported by a test (below), which keeps `knip` from reporting unused exports.

## Tests

Vitest `server` project, colocated.

`src/web-search/contract.test.ts` (new):

- `WEB_SEARCH_PROVIDER_API_VERSION` is 1.
- `ProviderRequestError` keeps its reason as its `message`, has `name` `'ProviderRequestError'`, and is an `instanceof Error`.
- A minimal provider module and manifest typed against `WebSearchProviderModule`, `WebSearchProviderManifest`, `WebSearchProvider`, `WebSearchRequest`, and `WebSearchCapability` activate and return results through an injected `fetch`; this checks the contract can be implemented from its types alone and keeps every type export used.

`src/web-search/render.test.ts` (new):

- Whitespace runs (including newlines and tabs) in titles and snippets collapse to one space; ends trimmed.
- `[`, `]`, `\` in a title are backslash-escaped, once each (`a\[b` becomes `a\\\[b`).
- Spaces and parentheses in a URL are percent-encoded.
- An empty (or whitespace-only) title is replaced by the encoded URL, escaped (`http://[::1]/` gives `http://\[::1\]/`).
- `ftp:`, `javascript:`, relative, and unparseable URLs are dropped and not counted.
- Dedupe: `HTTPS://Example.COM/a/` and `https://example.com/a#x` are one result; `https://e.com/a/?q=1` and `https://e.com/a?q=1` are one; `?q=1` and `?q=2` are two; `https://e.com` and `https://e.com/` are one; the first occurrence is kept.
- Order is preserved exactly as given by both `normalizeResults` and `dedupeResults`.
- Rendering: `- [<title>](<url>)` then a two-space-indented snippet line, single `\n` separators, no header, no trailing newline; an empty snippet gives no snippet line.
- Whole-result truncation: as many whole results as fit, then `(showing <k> of <n> results; raise --max-chars for more)`, with the total length including the note at or under the budget; `<n>` is the `total` argument.
- A budget exactly equal to the full rendering keeps every result and adds no note; one less drops a result and adds the note.
- No note when every result fits.
- First result too long for the budget: its snippet is cut and ends with `…`, the output (note included when `n > 1`) fits the budget, and `<k>` is 1.
- First result's link line alone longer than the budget: printed whole, no snippet.
- An empty list renders `''`.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual end-to-end check: this slice registers nothing and changes no user-visible behavior. The first manual check is in `./product/plans/ready/web-search-10-typed-command.md`.

## Out of scope

- Providers, the registry, the `webSearch` core, and the `No results for "<query>".` line (`./product/plans/ready/web-search-4-bundled-providers.md`, `./product/plans/ready/web-search-5-provider-registry.md`, `./product/plans/ready/web-search-6-search-core.md`).
- Cutting to `--results` (done by the core before rendering).
- The fixture provider and its compatibility test (`./product/plans/ready/web-search-5-provider-registry.md`).
- Re-ranking, fetching result pages, multi-step search (feature text).
