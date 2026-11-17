# Extract one local-or-remote runner for the web tab adapters

**Complexity: 4/10** — ~70 added lines, 2 adapters edited, 5 requirements, 7 scenarios, 4 new units (p=5.04)

`fetchWebInTab` in `src/web/fetch/tab-fetch.ts` and `searchWebInTab` in `src/web/search/tab-search.ts` are line-for-line copies: each parses its line, returns the usage error, picks a side with `localReadRoot`, runs a remote port call through `withRemoteTabPort` with an `errorText` catch, or calls its local core with `getProjectTokens()`, `globalThis.fetch`, the signal, and `reportProviderDisabled(...)`. The only differences are the parser, the remote operation prefix, the port method, and the core function. A future fix to remote routing or error rendering therefore has to land in two places.

## Goal

One generic runner owns the local-versus-remote routing once. The search and fetch adapters keep their exported names and signatures and become thin specs handed to that runner, so `src/web/tab-web.ts` and every caller stay unchanged.

## Approach

1. Add `src/web/tab-run.ts` exporting `runWebSubcommandInTab(managers, label, input, signal, spec)`. The spec carries `parse`, the `remoteOperation` prefix for `withRemoteTabPort`, a `remote(port, parsed)` call, and a `core(parsed, deps)` function. The runner parses and returns the usage error unchanged, uses `localReadRoot` to choose the side, runs the remote call through `withRemoteTabPort` with the existing `errorText` catch, and otherwise calls the core with `tokens: getProjectTokens()`, `fetch: globalThis.fetch`, the signal, and `reportDisabled: reportProviderDisabled(managers, label)`. Shared `WebTabSpec<P>` and `WebTabDeps` types keep both adapters type-safe without a type assertion.

2. Reduce `src/web/search/tab-search.ts` to one call to the runner with a spec built from `parseWebSearch`, prefix `web-search`, `port.webSearch`, and `webSearch`. Delete the local `searchRemote` helper.

3. Reduce `src/web/fetch/tab-fetch.ts` to one call to the runner with a spec built from `parseWebFetch`, prefix `web-fetch`, `port.webFetch`, and `webFetch`. Delete the local `fetchRemote` helper.

4. Leave `src/web/tab-web.ts`, both parsers, both cores, and the remote port untouched.

## Tests

- New colocated `src/web/tab-run.test.ts` drives the runner directly with a small spec and mocked `localReadRoot`, `withRemoteTabPort`, `getProjectTokens`, and `notify`: a parser error returns unchanged without reading the tab or opening a port; a local tab calls the core with project tokens, `globalThis.fetch`, the signal, and a disabled-report callback that posts one notification; a local core rejection propagates; a remote tab calls `withRemoteTabPort` with the spec prefix and the port method with the parsed command; a remote rejection becomes `errorText`; and an unavailable remote result returns unchanged.
- `src/web/search/tab-search.test.ts`, `src/web/fetch/tab-fetch.test.ts`, and `src/web/tab-web.test.ts` pass unchanged, pinning that both adapters and the dispatcher still behave the same.

## Out of scope

- Changing the parsers, the search/fetch cores, the remote port, or cancellation semantics.
- Any user-visible behavior change; this is a pure extraction.
- The other two pull-request backlog entries.
