# Web search 6: the `webSearch` core with provider fallback and failure lines

**Complexity: 5/10** — 18 requirements, 18 test scenarios, ~60 added lines in one new module, no existing files edited (p=5.68)

The sixth slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds `src/web-search/search.ts`: the one core function that the typed command, the local ACP loop, the far-side ACP loop, and the remote operation all call, so they cannot disagree. It holds the process-wide provider registry, resolves which providers to try, runs them one at a time with fallback, and turns the winner's results into the rendered text, or formats the failure lines. It knows nothing about tabs, ACP, or the remote channel.

## Dependencies

- `./product/plans/complete/web-search-1-command-grammar.md` — `WebSearchCommand` (`query`, `numResults`, `maxChars`, `depth`, `provider`, all required, defaults filled by `parseWebSearch`) from `src/web-search/command.ts`.
- `./product/plans/complete/web-search-2-result-rendering.md` — `normalizeResults`, `dedupeResults`, `renderResults(results, total, maxChars)` from `src/web-search/render.ts`; `WebSearchRequest`, `WebSearchCapability`, `WebSearchResult` from `src/web-search/contract.ts`.
- `./product/plans/complete/web-search-3-provider-tokens.md` — the `tavily` and `tinyfish` rows of `ProjectTokens`.
- `./product/plans/ready/web-search-4-bundled-providers.md` — the 30-second per-attempt budget and the abort rule (`requestJson` rethrows a prompt abort unchanged), both inside the providers, not here.
- `./product/plans/ready/web-search-5-provider-registry.md` — `createProviderRegistry`, `webSearchProviderCatalog` (`src/web-search/providers/catalog.ts`), `resolveAttempts` returning `AttemptResolution`, `runAttempt(manifest, request, capability, reportDisabled?)` returning `AttemptOutcome`, the `ProviderRegistry` type, and `formatFailures` (`src/web-search/failure-lines.ts`).
- Slices 1–5 must all have landed. This slice edits no existing file.

## Design decisions

Carried verbatim from the source plan where they apply.

- **One core (feature text).** One core function, `webSearch(query, numResults = 10, contextMaxCharacters = 10000, provider = "auto", depth = "basic") -> text`, serves both the typed command and the agent tool, so they cannot disagree. In code it is `webSearch(request, deps)` where `request` is the parsed command (`query`, `numResults`, `maxChars`, `depth`, `provider`) and `deps` is `{ tokens, fetch, signal?, reportDisabled? }`. The defaults come from `parseWebSearch`. Returns one string. No `Managers`, no tab, no channel, so both hosts call it directly.
- **Process-wide registry.** `search.ts` holds the one process-wide registry over `providers/catalog.ts`; creating it does no I/O and imports no provider, so the module top level stays side-effect free. It also exports the registry's provider names for completion (`./product/plans/ready/web-search-14-completion.md`).
- **Async semantics (`ai/guidelines/plugins.md` §5).** Attempts run sequentially, each awaited.
- **Provider auto-selection (user decision).** When the first configured provider fails, the search falls back to the next configured provider, as the ACP role model fallback does; the search fails only after every configured provider has been tried.
- **What falls back (user decision).** Any provider failure moves an auto search to the next configured provider: a missing or rejected key (HTTP 401, 402, 403), a quota or rate limit (429, Tavily's 432–434), any other non-2xx status, a timeout, a network error, or a response that does not decode. A plugin failure (`provider failed: …`, `requires provider API <n>`) also falls back. A successful search with zero results is an answer and does not fall back. An explicit `--provider <name>` uses only that provider and never falls back.
- **Failure lines (user decision).** Mirrors the ACP role model fallback wording. When exactly one provider was tried and it failed, the output is `Web search failed (<name>): <reason>.`. When more than one was tried and all failed, it is `Web search: every provider failed.` followed by one `- <name>: <reason>` line per attempt, in order. A reason is `HTTP <status> <status text>` (just `HTTP <status>` when the text is empty), `timed out after <n> s`, `invalid response`, or the first line of the network error. A search that succeeds after a fallback prints only its results.
- **Resolution lines.** The unknown-provider, not-configured, no-provider, and disabled-provider lines from `resolveAttempts` are returned unchanged, and nothing is sent.
- **Query length (user decision).** The core does not cap query length. A provider's own limit (Tavily refuses queries over 400 characters, TinyFish over 2000) shows up as that provider's HTTP 400 failure, and an auto search falls back to the next provider.
- **Result count (user decision).** The core keeps at most `numResults` results after dropping duplicates and bad URLs, so a search can return fewer. Order: normalize, dedupe, cut to `numResults`, then render with that count as the total.
- **No results (user decision).** A successful search left with no results, whether the provider returned none or every one was dropped as a duplicate or for its URL, prints `No results for "<query>".` with the query as sent. It is an answer, not a failure, so it does not fall back.
- **Timeout (user decision).** Each attempt has its own 30-second budget (in the shared request step, slice 4); an auto search that falls back can therefore take up to 30 seconds per configured provider. The core adds no timer of its own.
- **Cancellation (user decision).** When `deps.signal` aborts, the in-flight attempt's request is aborted at once (the signal is the capability's `signal`), no further fallback attempt starts, and `webSearch` rejects with the abort rather than returning a failure line, so the caller's cancelled-tool-step handling suppresses the late result. A caller with no signal (the typed command) runs until it answers or times out.
- **Domain filtering (user decision).** None is applied; `site:` operators travel inside the query unchanged.
- **Atomic (feature text).** One call, one result; no multi-step navigation and no follow-up fetching of result pages.

Decisions this pass adds, grounded in the earlier slices:

- **Failure formatting is reused (decision).** The failure lines come from `formatFailures(failures)` in `src/web-search/failure-lines.ts` (slice 5), called with the non-empty `{ name, reason }[]` in attempt order. `search.ts` writes no failure-line text of its own, so the core's lines and the registry's disabled-provider lines cannot drift. `<name>` is the manifest `id`.
- **Resolution handling (decision).** `resolveAttempts(request.provider, deps.tokens)` returns `AttemptResolution`: `{ kind: 'line', line }` is returned as is; `{ kind: 'attempts', manifests }` is the non-empty ordered list to try. The core does not re-check names, tokens, or the disabled set — the registry already did — and an explicit `--provider` "never falls back" because its list has exactly one manifest, so the loop needs no separate auto/explicit branch.
- **Request and capability (decision).** Each attempt gets the provider-facing `WebSearchRequest` `{ query, numResults, depth }` taken from the command; `maxChars` and `provider` never reach a provider. The capability is `{ apiKey: deps.tokens[manifest.token] ?? '', fetch: deps.fetch, signal: deps.signal }` (the `?? ''` only satisfies the type; `resolveAttempts` returns configured providers only). Built fresh per attempt so each provider sees only its own key.
- **Outcome handling (decision).** On each `AttemptOutcome`: `'results'` stops the loop; `'failed'` and `'plugin-failed'` both record `{ name: manifest.id, reason }` and continue to the next manifest; `'aborted'` rethrows its `error` unchanged (the original rejection, normally `signal.reason`). `deps.reportDisabled` is passed straight through as `runAttempt`'s fourth argument; the core never calls it itself.
- **Abort checks (decision).** Before starting each attempt, and again after a `'results'` outcome, the core calls `deps.signal?.throwIfAborted()`. So an abort that lands between two attempts starts no further attempt, and a `search` that resolves after the signal fired (slice 5 leaves this to the core) still rejects with the abort rather than returning late text. Once aborted, `webSearch` always rejects.
- **Results path (decision).** `normalizeResults(results)` → `dedupeResults(…)` → `.slice(0, request.numResults)`; when the cut list is empty, return `No results for "${request.query}".` (the query exactly as sent, no escaping); otherwise `renderResults(cut, cut.length, request.maxChars)`, never with an empty list (slice 2's `total` decision).
- **Test seam (decision).** `search.ts` exports `runWebSearch(registry, request, deps)`, which does all the work against a given `ProviderRegistry`, and `webSearch(request, deps)`, a one-line call of `runWebSearch` with the module-level registry `createProviderRegistry(webSearchProviderCatalog)`. Tests build their own registry over fake manifests and call `runWebSearch`; production callers (slices 7, 10, 11) import only `webSearch`, and sibling tests mock `webSearch`. No `vi.mock` of the catalog and no `vi.resetModules`, so the process-wide disabled set never leaks between tests. `knip` counts the test import as a use.
- **Provider names export (decision).** `webSearchProviderNames()` returns the module-level registry's `providerNames()`. This is the name completion (slice 14) imports from `search.ts`.
- **Exported types (decision).** `WebSearchDeps` — `tokens: ProjectTokens`, `fetch: typeof fetch`, optional `signal: AbortSignal`, optional `reportDisabled: (name: string, reason: string) => void` (the same signature slice 5's `runAttempt` takes). `webSearch` and `runWebSearch` resolve to `Promise<string>`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Role model fallback wording | `src/acp/ask-role.ts` (`exhaustedError`: `ACP: every model in the ${role} role failed.` then `- <entry>: <error>` lines joined with `\n`) | The shape `formatFailures` already copies; nothing in this slice imports `ask-role.ts`. |
| Failure lines | `src/web-search/failure-lines.ts` (`formatFailures`, slice 5) | The single-failure line and the every-provider-failed list. |
| Rendering pipeline | `src/web-search/render.ts` (slice 2) | Normalize, dedupe, render. |
| Registry and catalog | `src/web-search/registry.ts` (`createProviderRegistry`, `ProviderRegistry`, `AttemptResolution`, `AttemptOutcome`), `src/web-search/providers/catalog.ts` (`webSearchProviderCatalog`) (slice 5) | Resolution, guarded attempts, disabling. |
| Parsed command | `src/web-search/command.ts` (`WebSearchCommand`, slice 1) | The `request` type. |
| Token record | `src/project/tokens.ts:70` (`export type ProjectTokens = Partial<Record<ProjectTokenName, string>>`) | `deps.tokens` supplies each provider's `apiKey` by its manifest's `token` name. |
| Fake-fetch test pattern | `src/models/providers/anthropic.test.ts` | A fake `fetch` typed `typeof fetch` recording its calls. |

## Proposed changes

All relative imports carry `.js`; type-only imports use `import type`.

- **`src/web-search/search.ts`** (new, ~45 counted lines) — the module-level registry, `WebSearchDeps`, `runWebSearch`, `webSearch`, and `webSearchProviderNames` as decided above. `runWebSearch`:
  1. `resolveAttempts(request.provider, deps.tokens)`; a `'line'` resolution is returned as is.
  2. For each manifest in order: `deps.signal?.throwIfAborted()`; build the request and capability; `await runAttempt(manifest, providerRequest, capability, deps.reportDisabled)`; handle the outcome as decided above.
  3. After `'results'`: `deps.signal?.throwIfAborted()`, then the results path.
  4. When the loop ends with only failures: `formatFailures(failures)`.
  Keep `runWebSearch` under `sonarjs/cognitive-complexity` by putting the results path in its own unexported function (for example `renderSearch(results, request)`).

## Tests

`src/web-search/search.test.ts` (new, vitest `server` project), calling `runWebSearch` against a registry from `createProviderRegistry` over fake manifests (ids `tavily` and `tinyfish`, tokens `'tavily'` / `'tinyfish'`, `apiVersion: WEB_SEARCH_PROVIDER_API_VERSION`) whose `activate` resolves to in-test provider modules; a fresh registry per test. Providers that need HTTP behavior throw `ProviderRequestError(<reason>)` directly or go through an injected fake `fetch`; no live network.

- Auto picks the first configured provider in catalog order and skips unconfigured ones; that provider receives `{ query, numResults, depth }` only and a capability with its own token as `apiKey`, `deps.fetch`, and `deps.signal`.
- Auto falls back on `HTTP 401 Unauthorized`, `HTTP 429 Too Many Requests`, `timed out after 30 s`, `invalid response`, and a plugin failure (a `search` that throws a plain `Error`); succeeding after a fallback prints only results.
- Auto does not fall back on zero results; prints `No results for "<query>".` and the second provider is never activated.
- Every result dropped as a duplicate or bad URL prints `No results for "<query>".`.
- Explicit `--provider tinyfish` with both configured never tries tavily; one failure prints `Web search failed (tinyfish): <reason>.`.
- Two failures print `Web search: every provider failed.` and one `- <name>: <reason>` line each, in order.
- No-provider, not-configured, unknown-provider, and disabled-provider lines pass through unchanged, and neither `activate` nor `fetch` is called.
- More than `numResults` results are cut to `numResults` after dedupe; with a small `maxChars` the truncation note's `<n>` is the cut count, not the provider's raw count.
- An over-400-character query reaches the provider unchanged, and a provider `HTTP 400 Bad Request` falls back.
- An abort during the first attempt rejects with the abort's error and never activates the second provider.
- An abort between attempts (fired while the first provider's failure resolves) starts no second attempt and rejects.
- A `search` that resolves after the signal aborted still makes `runWebSearch` reject.
- `reportDisabled` from `deps` is called once with `(id, reason)` on a plugin failure; without it the search still falls back.
- `webSearchProviderNames()` returns `['tavily', 'tinyfish']` (the real catalog, manifests only, no `activate`).

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual app check: nothing calls `webSearch` until `./product/plans/ready/web-search-10-typed-command.md` and `./product/plans/ready/web-search-11-workspace-routes.md`.

## Out of scope

- Calling `webSearch` from a tab, the remote operation, or either ACP loop (`./product/plans/ready/web-search-7-remote-operation.md`, `./product/plans/ready/web-search-10-typed-command.md`, `./product/plans/ready/web-search-11-workspace-routes.md`).
- Posting the disabled-provider notification (slice 10); the core only passes `reportDisabled` through.
- Resolution, the disabled set, and failure-line text (slice 5); the request timeout and abort classification inside a provider (slice 4).
- A core query-length cap; paging a provider to reach `--results` (user decisions).
