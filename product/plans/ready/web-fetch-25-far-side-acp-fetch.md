# Web fetch 25 — `web fetch` in the far-side ACP loop

**Complexity: 4/10** — 9 requirements and 13 test scenarios on ~15 added lines in 1 edited file (p=5.09)

Run order: 25 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the far-side sentence of "Where a fetch runs", the remote-host sentence of "Disabled providers", the abort sentences of "Remote connection lines and cancellation", "Bare `web`" as it applies to the far side, the `serve-acp-loop.ts` half of the `runWorkspace` bullet under "Wiring into existing registries", the far-side half of step 6 of "Order of work", the `serve-acp-loop.test.ts` part of the "Wiring" bullet under "Tests", and the far-side parts of the `web-fetch.md` and `acp.md` documentation). Depends on:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, which moves the loop's imports to `isWebCommandLine` in `src/web/command-line.ts`, `parseWebSearch` in `src/web/search/command.ts`, and `webSearch` in `src/web/search/search.ts`, and repoints the test's imports and `vi.mock` to `../web/search/…`;
- `product/plans/ready/web-fetch-13-fetch-parser.md`, for `parseWebFetch`, `WEB_FETCH_USAGE`, and `WebFetchCommand` in `src/web/fetch/command.ts`;
- `product/plans/ready/web-fetch-15-fetch-core.md`, for `webFetch` and `WebFetchDeps` in `src/web/fetch/fetch.ts`, which rejects with the abort instead of printing (subplan 6 keeps an aborted attempt from disabling a provider);
- `product/plans/ready/web-fetch-20-web-entry-point.md`, for `webSubcommand` and `WEB_USAGE` in `src/web/command-line.ts`;
- `product/plans/ready/web-fetch-21-fetch-tab-adapter.md`, which creates `product/specs/web-fetch.md` with its `### Agent tool` heading;
- `product/plans/ready/web-fetch-24-agent-fetch-tool.md`, which adds `web fetch` to `NATIVE_ACP_COMMANDS` and makes the `web` tool extract a lowercase `web fetch` reply line (with subplan 23's `isWebFetchReplyLine`), fills the local half of `### Agent tool`, and adds the `### Web fetch` subsection to `product/specs/acp.md`.

Land this directly after subplan 24. Between the two, a remote-hosted session granted `web fetch` gets the fetch primer, but its `web fetch` step answers with the `web search` usage line (subplan 24, "Remote-hosted loops until subplan 25"). Separately, since subplan 20, a remote-hosted loop answers bare `web` with only that search usage line, while a local tab answers it with both lines (subplan 20, "Out of scope"). This plan closes both gaps.

When an `ask` or `tell` session is hosted on a remote machine, its tool loop runs there, in `startRemoteLoop` (`src/remote/serve-acp-loop.ts`). A workspace step that is a `web` line goes to the private `searchWorkspaceCommand`, which parses every `web` line with `parseWebSearch`. This plan replaces it with one far-side web function that dispatches both subcommands. A remote-hosted loop then fetches on the far side, with the workspace's merged tokens and the loop's abort signal, and posts no notification.

Paths below are post-subplan-24. At today's baseline the loop imports `isWebCommandLine` and `parseWebSearch` from `../web-search/command.js` and `webSearch` from `../web-search/search.js` (`src/remote/serve-acp-loop.ts:12`–`13`). `src/web/fetch/` and `webSubcommand` don't exist yet. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **One far-side web function (source plan, Wiring and Where a fetch runs).** Replace the private `searchWorkspaceCommand` (`function searchWorkspaceCommand(line: string, tokens: ProjectTokens, signal: AbortSignal): string | Promise<string> {`) with a private `webWorkspaceCommand` that has the same parameters and return type. It branches on `webSubcommand(line)`:
  - `'search'`: parse with `parseWebSearch`. On `{ error }`, return the error, which is `WEB_SEARCH_USAGE`. Otherwise return `webSearch(parsed, deps)`. This is today's body unchanged, so no `web search` output changes.
  - `'fetch'`: parse with `parseWebFetch`. On `{ error }`, return the error, which is `WEB_FETCH_USAGE` alone. Otherwise return `webFetch(parsed, deps)`.
  - `undefined`, meaning bare `web` or any `web <word>` other than `search` or `fetch`: return `WEB_USAGE`, the search usage line, a newline, then the fetch usage line.
  Usage answers return synchronously as plain strings, as today. The existing test `expect(host.runWorkspace(line)).toBe(…)` relies on that, and so does `dropLateRejection` in `src/acp/drive-loop.ts`, which passes a string straight through. The `isWebCommandLine(normalized)` branch in `runWorkspace` keeps its place and its `normalized` argument, and calls `webWorkspaceCommand(normalized, tokens, controller.signal)`. So a leading `/` and surrounding spaces are stripped before dispatch, for a fetch as for a search. `webSubcommand` doesn't re-check the first word, because that branch has already claimed the line (subplan 20).
- **Deps (source plan, Where a fetch runs and Disabled providers).** Each call builds a fresh literal `{ tokens, fetch: globalThis.fetch, signal }`, exactly the search's deps today:
  - `tokens` is the loop's `tokens` parameter. That's the workspace's merged token map: `serve-provision.ts` passes it to `new RemoteAcp(emit, result.dir, tokens)`, and `RemoteAcp` passes it to `startRemoteLoop`. Forwarded tokens win over the remote's own files.
  - `globalThis.fetch` is the remote process's own transport, so the `local` provider reaches the remote host's network.
  - `signal` is `controller.signal`.
  There's no `reportDisabled`, so a far-side fetch posts no notification, and a provider it disables stays disabled in that remote process's registry until the process restarts. There's no `now`, so subplan 16's cache uses `Date.now`, and the remote process keeps its own cache.
- **No local fallback (source plan, Where a fetch runs).** A remote-hosted loop's fetch runs where the loop runs and never sends a caller request (`runCaller`) or a `web-fetch` remote operation. It calls the core directly, as `web-fetch-operation.ts` does (subplan 18).
- **Cancellation (source plan, Remote connection lines and cancellation).** The far side's `abort()` and `cancel()` both call `controller.abort()`. Through the shared signal:
  - an in-flight attempt stops, no further attempt runs, and `webFetch` rejects with the abort instead of printing (subplan 15). An attempt that sees the abort disables no provider (subplan 6).
  - `dropLateRejection` in `src/acp/drive-loop.ts` turns that late rejection into `''`, and the loop's `aborted()` guards in `startRemoteLoop` send no `acp-tool-step`, `acp-error`, or next turn.
  That's the mechanism a far-side search uses today, so nothing new is written for it. `RemoteAcp` in `src/remote/serve-acp.ts` already calls `run.cancel()` from `cancel(id)`, and `run.abort()` from `close(id)`, `detachRuns()`, `dispose()`, and a fatal session error.
- **No protocol change.** No frame changes shape: a far-side fetch step travels as an ordinary `acp-tool-step`. The series' one protocol bump is subplan 19's.
- **Imports.** The existing `isWebCommandLine` import from `../web/command-line.js` gains `webSubcommand` and `WEB_USAGE`. Add `parseWebFetch` from `../web/fetch/command.js` and `webFetch` from `../web/fetch/fetch.js`. Keep the `parseWebSearch` and `webSearch` imports. Nothing under `src/web/` imports `src/remote/`, so no cycle forms.
- **File size and lint.** `serve-acp-loop.ts` is 120 counted lines (130 raw), and subplan 1's import split adds one. This plan adds about 13, so it lands near 134, well under the 200-line `max-lines` limit. `webWorkspaceCommand`'s cognitive complexity is about 6, under `sonarjs/cognitive-complexity`'s 15. The two branches differ in every identifier (`parseWebSearch` and `webSearch` against `parseWebFetch` and `webFetch`), so jscpd (5 lines, 50 tokens) sees no clone.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Far-side dispatch | `searchWorkspaceCommand` and the `isWebCommandLine(normalized)` branch of `runWorkspace` in `startRemoteLoop`, `src/remote/serve-acp-loop.ts` | Replaced and repointed |
| Subcommand split | `webSubcommand`, `WEB_USAGE` in `src/web/command-line.ts` (subplan 20) | Dispatch, and the bare-`web` answer |
| Parsers | `parseWebSearch` in `src/web/search/command.ts`; `parseWebFetch` and `WEB_FETCH_USAGE` in `src/web/fetch/command.ts` (subplan 13) | Parse, and each subcommand's own usage line |
| Cores | `webSearch` in `src/web/search/search.ts`; `webFetch` in `src/web/fetch/fetch.ts` (subplan 15) | Run with the loop's deps |
| Late-result suppression | `dropLateRejection` and `settleUnlessAborted` in `src/acp/drive-loop.ts`; the `aborted()` guards in `startRemoteLoop` | Cancellation, unchanged |
| Token source | `RemoteAcp` in `src/remote/serve-acp.ts`, built in `src/remote/serve-provision.ts` | The workspace's merged tokens, unchanged |
| Test patterns | in `src/remote/serve-acp-loop.test.ts`: `'runs a granted web search against the workspace and reports the result as a workspace step'`, the `describe('startRemoteLoop web routing')` block, and `'suppresses a late grep result and the next turn after an abort'` | Shape of each new fetch case |

## Proposed changes

- `src/remote/serve-acp-loop.ts`: replace `searchWorkspaceCommand` with `webWorkspaceCommand`, repoint the `runWorkspace` branch, and add the imports above.

## Tests

`src/remote/serve-acp-loop.test.ts`. Add `webFetch: vi.fn()` to the hoisted `mocks`, and `vi.mock('../web/fetch/fetch.js', () => ({ webFetch: mocks.webFetch }))` beside the `webSearch` mock. Returning only `webFetch` is safe for the same reason the search mock returns only `webSearch`: the other export, `webFetchProviderNames`, is read by `src/completion/web.ts` (subplan 22), which this test's module graph doesn't load, as it doesn't load `webSearchProviderNames` today. TypeScript doesn't check a `vi.mock` path, so a wrong one silently stops mocking. In `beforeEach`, `mockReset` it and resolve `'fetched page'`, as `webSearch` resolves `'search results'`. Import `parseWebFetch`, `WEB_FETCH_USAGE`, and type `WebFetchCommand` from `../web/fetch/command.js`, type `WebFetchDeps` from `../web/fetch/fetch.js`, and `WEB_USAGE` from `../web/command-line.js`. Use `https://example.com/page` as the URL.

Beside `'runs a granted web search against the workspace and reports the result as a workspace step'`:

- with `coreSnapshot('tell', ['web fetch'])`, tokens `{ tavily: 'tvly-far' }`, and turns `[['web fetch https://example.com/page'], ['Done.']]`, `webFetch` is called once with `parseWebFetch('web fetch https://example.com/page')` and deps whose `tokens` is the same object, and the run sends exactly one `{ type: 'acp-tool-step', id: RUN_ID, command: 'web fetch https://example.com/page', result: 'fetched page', workspace: true }`. `webSearch` is never called, and no `acp-tool-request` frame is sent. This pins the end-to-end far-side path that subplan 24 left answering with the search usage line.

In `describe('startRemoteLoop web routing')`:

- `'runs a web line with the workspace tokens and the run signal'` also asserts `webFetch` was not called.
- A new case: `host.runWorkspace('web fetch https://example.com/page')` resolves to `'fetched page'`. `webFetch` is called once with `parseWebFetch(…)` of that line and deps where `tokens` equals `{ tavily: 'tvly-far' }`, `fetch` is `globalThis.fetch`, and `signal` is not aborted. The deps have neither `reportDisabled` nor `now`. `webSearch` is not called.
- A new case: `' /web fetch https://example.com/page'` is normalized and parses to the same request.
- Replace `it.each(['web', 'web search x --results 30'])` with three tables, each asserting the synchronous return with `toBe` and that neither `webSearch` nor `webFetch` was called:
  - `web` and `web foo` return `WEB_USAGE`;
  - `web search` and `web search x --results 30` return `WEB_SEARCH_USAGE`;
  - `web fetch`, `web fetch example.com`, and `web fetch https://example.com/page --bogus 1` return `WEB_FETCH_USAGE`.
- Two new cases mirroring `'aborts the signal passed to the search when the run is aborted'` and `'… when the run is cancelled'`, for the signal passed to `webFetch`: `run.handle.abort()` aborts it, and `run.handle.cancel()` aborts it before the cancellation settles.
- A new case mirroring `'suppresses a late grep result and the next turn after an abort'`: `webFetch` returns a promise that rejects with the signal's reason when its signal aborts. Start with `startHeld(coreSnapshot('tell', ['web fetch']))`, send the `web fetch https://example.com/page` chunk and `end_turn`, and wait until `webFetch` is called. Then `run.handle.abort()` and `flush()`. The frame count is unchanged, there's no `acp-tool-step` or `acp-error` frame, and `run.sent` has length 1.

## Out of scope

- Everything on the local side: the entry point, adapter, completion, primer, reply line, vocabulary, and grants (subplans 20 to 24).
- The remote `web-fetch` operation and its sender (subplans 18 and 19). The far-side loop calls the core directly.
- Any change to `startRemoteLoop`'s other routes, to `drive-loop.ts`, or to the frames.

## Documentation

Describe the end state. Name no subplan.

- `product/specs/web-fetch.md`, `### Agent tool`: after subplan 24's sentences on where a local agent fetch runs and how it's cancelled, add the remote-hosted loop, naming `startRemoteLoop` in `src/remote/serve-acp-loop.ts` and cross-referencing [[acp]] and [[remote-server]]. A remote-hosted loop fetches on the far side, in the workspace it serves, with that workspace's merged tokens (forwarded tokens win), so its `local` provider sees the remote host's network and it never falls back to the machine running Janissary. It posts no notification, a provider it disables stays disabled in that remote process until it restarts, and that process keeps its own fetch cache. Aborting or cancelling the run aborts an in-flight fetch, tries no further attempt, and drops its late result. Keep this distinct from the "Where a fetch runs" sentence that a fetch sent to a remote host has no cancellation: a remote-hosted loop's fetch runs in the loop's own process, so it does. A malformed `web fetch` step answers with the fetch usage line alone.
- `product/specs/acp.md`, the workspace-routing sentence (`A \`web\` line likewise goes to the same search as the typed command on the side that owns the tab: …`): its far-side clause (`and on the far side with that workspace's merged tokens and no notification`) covers a search or a fetch. Subplan 24 already widened the local half and the following cancellation sentence. Confirm that sentence now says aborting a remote-hosted run aborts an in-flight search or fetch and starts no further provider.
- `product/specs/acp.md`, `### Web fetch`: its workspace-routing sentences gain the remote-hosted case. A remote-hosted loop runs a granted `web fetch` on the far side with that workspace's merged tokens and no notification, and its workspace step carries the `[<host>] ` tag like any far-side step.

No `help/` or `documentation/user-documentation/` change. Subplan 24's text already says a granted fetch follows the tab, which is true of a remote-hosted session once this plan lands. `product/specs/remote-server.md` needs nothing, because no frame or protocol version changes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/remote src/acp` so the loop, `serve-acp`, and `record-feed` suites run even where `--changed` would skip one. Confirm `git grep -n "searchWorkspaceCommand" -- src` finds nothing.

Then, with a remote host available:

1. Open a remote tab. In its shell, start a server that listens only on the remote host, for example `python3 -m http.server 8765 --bind 127.0.0.1`.
2. Open an `ask` session on that tab that's hosted on the remote machine, not a local fallback. Ask it to read `http://localhost:8765/`. Confirm the transcript shows a `[<host>] web fetch http://localhost:8765/` step, and its result starts `Fetched http://localhost:8765/ (local).` with the remote directory listing. The machine running Janissary has no such server, so the listing proves the fetch ran on the far side.
3. Ask for a page on a host that doesn't answer, such as `http://10.255.255.1/`, and cancel the prompt while the step is running. Confirm no step result appears and the session takes a new prompt.
