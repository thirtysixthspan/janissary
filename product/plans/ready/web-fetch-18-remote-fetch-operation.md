# Web fetch 18 — the far-side `web-fetch` operation

**Complexity: 6/10** — 43 test scenarios (mostly one-line boundary refusals), 10 requirements, ~48 added lines in 1 new module and 3 edited files (p=6.15)

Run order: 18 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Remote transport" and "Where a fetch runs" decisions, the far-side half of the remote-layer bullet under "Wiring into existing registries", the "Disabled providers" sentence about remote hosts, and the operation half of step 7 of "Order of work"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/` layout and the renamed imports in the files and tests named here;
- `product/plans/ready/web-fetch-13-fetch-parser.md`, for `WebFetchCommand`, the range constants, and the `isWebFetchUrl` and `isWebFetchFormat` guards in `src/web/fetch/command.ts`;
- `product/plans/ready/web-fetch-15-fetch-core.md`, for `webFetch` and `WebFetchDeps` in `src/web/fetch/fetch.ts`;
- `product/plans/ready/web-fetch-16-fetch-cache.md`, which leaves `webFetch`'s signature unchanged and gives each process its own cache;
- `product/plans/ready/web-fetch-17-remote-operation-extractions.md`, for `WEB_OPERATIONS` in `src/remote/filesystem/web-operations.ts` and the exported `boundedInteger` and `requireBoundedInteger` in `src/remote/filesystem/argument-checks.ts`.

A fetch on a remote tab runs entirely on the remote host, in that tab's workspace, with that workspace's merged tokens. Its `local` provider therefore sees the remote host's network, and it never falls back to the machine running Janissary. `web search` does this already through the path-free `web-search` filesystem operation. This plan adds the far-side half of the sibling `web-fetch` operation: its argument type, boundary validation, run, and result decoder. The near-side sender, the long-running deadline, and the protocol version bump follow in subplan 19.

Nothing sends `web-fetch` until subplan 19, so leaving `REMOTE_PROTOCOL_VERSION` alone here is safe: a peer that knows the operation and one that doesn't never disagree about a frame either of them sends.

Paths below are the post-subplan-17 ones. At today's baseline the model is `src/remote/filesystem/web-search-operation.ts` (`export const webSearchOperation = descriptorFor<'web-search'>()({`, line 31), and its imports still point at `../../web-search/`. `src/web/fetch/` and `src/remote/filesystem/web-operations.ts` don't exist yet. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Operation type (source plan, Remote transport).** In `src/remote/protocol-frames.ts`, add `'web-fetch'` to the `RemoteFilesystemOperation` union directly after `'web-search'` (line 21 today, still one line). Add `'web-fetch': WebFetchCommand;` to `RemoteFilesystemArgumentsByOperation` directly after `'web-search': WebSearchCommand;` (line 43). Import it with `import type { WebFetchCommand } from '../web/fetch/command.js';` beside the `WebSearchCommand` import (line 12). The operation is path-free and read-only, and its result is `{ text }`. The file counts 170 lines today, so two more lines are no concern.
- **Where it registers.** The union member alone fails the build until `FILESYSTEM_OPERATIONS` has the entry, through its `satisfies Record<RemoteFilesystemOperation, AnyOperationDescriptor>` (`operations.ts`). Add `'web-fetch': webFetchOperation` to `WEB_OPERATIONS` in `src/remote/filesystem/web-operations.ts`, after `'web-search'`, with an import from `./web-fetch-operation.js`. That spreads it into `READ_OPERATIONS`, as the source plan requires. Don't edit `operations.ts`: it sits at the 200-line limit, and subplan 17 made the web table so this plan wouldn't have to.
- **Descriptor.** `webFetchOperation` in a new `src/remote/filesystem/web-fetch-operation.ts` is declared through `descriptorFor<'web-fetch'>()`, shaped exactly like `webSearchOperation`. It has `valid`, `decode`, `paths`, `decodeResult`, and `run`. It sets no `rootDestination` and no `refusal`, like `web-search`. So a near-side connection failure rejects with its reason (`refusalValueFor` in `src/remote/filesystem/refusal.ts` returns `classified: false`), and subplan 21's adapter prints that reason. `paths` returns `[]`, so the containment check has nothing to refuse.
- **Field checks (source plan, Remote transport).** `valid` is true only when all six fields pass:
  - `url` is a string (`stringValue`) for which `isWebFetchUrl` is true. That's `URL.canParse` plus an `http:` or `https:` protocol, so an empty string, `ftp://x`, and `not a url` all fail. Call `stringValue` first because `isWebFetchUrl` takes a `string`, not `unknown`.
  - `format` passes `isWebFetchFormat`, so it's exactly `markdown`, `text`, or `html`. There's no lowercasing here: the near side sends the parser's already-lowercased value, so `Markdown` is refused.
  - `timeoutSeconds` passes `boundedInteger(value, WEB_FETCH_MIN_TIMEOUT_SECONDS, WEB_FETCH_MAX_TIMEOUT_SECONDS)`.
  - `maxChars` passes `boundedInteger(value, WEB_FETCH_MIN_CHARS, WEB_FETCH_MAX_CHARS)`.
  - `offset` passes `boundedInteger(value, WEB_FETCH_MIN_OFFSET, Number.MAX_SAFE_INTEGER)`, so any safe integer of 0 or more, matching the parser's refusal of `9007199254740992`.
  - `provider` is any string (`stringValue`), as for `web-search`. An unknown or empty name is resolution's refusal line, not a boundary error.
  Import the guards and constants from `../../web/fetch/command.js`, and `boundedInteger`, `requireBoundedInteger`, `requireString`, and `stringValue` from `./argument-checks.js`. Don't restate the URL or format rule.
- **Decode.** `decode` re-checks every field and returns a fresh object holding exactly the six fields, as `webSearchOperation.decode` does, so an extra key on the wire never reaches `webFetch`. The `url` is returned exactly as received, never normalized, because subplan 16's cache keys on the URL as typed. `timeoutSeconds`, `maxChars`, and `offset` go through `requireBoundedInteger` with the same bounds as `valid`. `provider` goes through `requireString`. `url` and `format` go through two module-private helpers, `requireWebFetchUrl(value: unknown): string` and `requireWebFetchFormat(value: unknown): WebFetchFormat`, shaped like `requireDepth` in `web-search-operation.ts`. Each throws a module-local `INVALID_ARGUMENTS` constant with the text `Invalid remote filesystem operation arguments.`.
- **How a bad frame is refused.** The two layers refuse differently, and tests must expect the right text for each:
  - On the wire, `decodeRequest` in `src/remote/frame/decode-filesystem.ts` calls `valid` first. A `false` refuses the whole frame as `Malformed remote frame "filesystem-request".` (`malformed` in `src/remote/frame/decode-shared.ts`), and `decode` never runs.
  - Called directly without its validator, `decode` throws `Invalid remote filesystem operation arguments.`.
- **Far-side run (source plan, Where a fetch runs).** `run` returns `{ text: await webFetch(args, { tokens: context.tokens, fetch }) }`, the same one-liner `webSearchOperation.run` uses. `context.tokens` is the workspace's merged token map: `serve-provision.ts` passes it to `new RemoteFileNavigators(…, tokens)`, and `RemoteFileNavigators.context()` hands it to every operation. `fetch` is the remote process's global `fetch`, so the `local` provider reaches the remote host's network. The deps carry exactly those two keys:
  - No `reportDisabled`, so a fetch on a remote host posts no notification, as with `web search` (source plan, Disabled providers). A provider it disables stays disabled in that host's own registry.
  - No `signal`, as `web-search` passes none. A remote fetch has no cancellation, and the near side's long deadline from subplan 19 bounds the wait.
  - No `now`, so subplan 16's cache uses `Date.now`.
  The far side's own module-level registry and cache serve it (subplans 15 and 16). A rejection from `webFetch` becomes the request's error reply, as a rejected `webSearch` does today.
- **Result decoder.** In `src/remote/filesystem/result-decoders.ts`, add a `'web-fetch'` entry directly after `'web-search'` (line 60 today), with the same inline predicate: a record whose `text` is a string of length above 0. Every fetch output is non-empty, because it's always a source line, a redirect line, a refusal, or a failure line. So an empty `text` means a broken peer, and the near side throws `Invalid remote filesystem operation result.`. Keep the predicate inline like the neighbouring `{ text }` decoders. Two lines aren't a jscpd clone (`.jscpd.json` needs 5 lines and 50 tokens).
- **Size and lint.** `web-fetch-operation.ts` lands near 40 counted lines, like `web-search-operation.ts`. `valid` is one `&&` chain, well under `sonarjs/cognitive-complexity`'s 15. Use `import type` for `WebFetchFormat` (from `../../web/providers/contract.js`) and for `WebFetchCommand` in `protocol-frames.ts`, per `@typescript-eslint/consistent-type-imports`. No import cycle results, because nothing under `src/web/` imports from `src/remote/`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| `web-search` operation | `webSearchOperation` and `requireDepth` in `src/remote/filesystem/web-search-operation.ts` | Exact model for validation, decode, the private `require…` helpers, and run |
| Argument checks | `requireString`, `stringValue`, and (after subplan 17) `boundedInteger`, `requireBoundedInteger` in `src/remote/filesystem/argument-checks.ts` | Field validation |
| Fetch guards and constants | `isWebFetchUrl`, `isWebFetchFormat`, `WEB_FETCH_MIN_TIMEOUT_SECONDS`, `WEB_FETCH_MAX_TIMEOUT_SECONDS`, `WEB_FETCH_MIN_CHARS`, `WEB_FETCH_MAX_CHARS`, `WEB_FETCH_MIN_OFFSET` in `src/web/fetch/command.ts` (subplan 13) | The URL, format, and range rules, not restated |
| Fetch core | `webFetch` in `src/web/fetch/fetch.ts` (subplans 15 and 16) | What `run` calls |
| Web operation table | `WEB_OPERATIONS` in `src/remote/filesystem/web-operations.ts` (subplan 17) | Gains the entry |
| Exhaustiveness check | `FILESYSTEM_OPERATIONS` `satisfies Record<RemoteFilesystemOperation, …>` in `src/remote/filesystem/operations.ts` | Fails the build if the union and the table disagree |
| Frame validation | `decodeRequest` in `src/remote/frame/decode-filesystem.ts` | Calls `valid`, then `decode`; nothing to change |
| Result decoders | `resultDecoders['web-search']` in `src/remote/filesystem/result-decoders.ts` | Model for `'web-fetch'` |
| Operation context tokens | `OperationContext.tokens` in `src/remote/filesystem/operation-types.ts`, filled by `RemoteFileNavigators.context()` in `src/remote/serve-file-navigator.ts` | The workspace's merged tokens |

## Proposed changes

Land these as one change. The union member and the table entry must arrive together, or the `satisfies` check fails typecheck.

- `src/remote/protocol-frames.ts`: the union member, the argument type, and the type import.
- `src/remote/filesystem/web-fetch-operation.ts` (new): `webFetchOperation`, its two private `require…` helpers, and its `INVALID_ARGUMENTS` constant.
- `src/remote/filesystem/web-operations.ts`: the import and the entry.
- `src/remote/filesystem/result-decoders.ts`: the `'web-fetch'` decoder.

## Tests

`src/remote/filesystem/operations.test.ts`, importing the fetch range constants from `../../web/fetch/command.js`:

- `ALL_OPERATIONS` gains `'web-fetch'` after `'web-search'`, which the key-list, recognition, and malformed-result cases then cover.
- `VALID_RESULTS` gains a `'web-fetch'` entry with non-empty `text`. Its mapped type requires it, so the test file doesn't typecheck without it.
- `PATH_CASES` gains one well-formed record (`https://example.com/page`, `markdown`, 30, 10000, 0, `auto`) with paths `[]`. The existing `it.each` blocks then check it's accepted, names no paths, and decodes to exactly its six keys.
- A new `it` beside `'accepts both web-search range edges and decodes only its five fields'`:
  - each range edge is accepted: `timeoutSeconds` 1 and 120, `maxChars` 200 and 100000, `offset` 0 and `Number.MAX_SAFE_INTEGER`;
  - `HTTPS://Example.com/A` and `http://localhost:3000/x` are accepted, and `decode` returns each URL unchanged;
  - `decode` drops an extra key;
  - `decode` called with `timeoutSeconds: 0` throws `Invalid remote filesystem operation arguments.`.
- `INVALID_CASES` gains one `web-fetch` row per refusal, each otherwise valid: missing URL, empty URL, non-string URL, `ftp://example.com`, `not a url`, `format: 'Markdown'`, `format: 'pdf'`, `timeoutSeconds` of 0, 121, 1.5, and `'30'`, `maxChars` of 199 and 100001, `offset` of −1, 1.5, and `Number.MAX_SAFE_INTEGER + 1`, a missing provider, and a numeric provider.
- A new `it` beside `'accepts a web-search result only with non-empty text'`: the `'web-fetch'` decoder accepts non-empty text and throws `Invalid remote filesystem operation result.` for `{}`, `{ text: 3 }`, and `{ text: '' }`.

`src/remote/serve-file-navigator.test.ts`: add `vi.mock('../web/fetch/fetch.js', () => ({ webFetch: vi.fn() }))` beside the `webSearch` mock (line 29 today). Without it the test would reach the network. Then add a `describe('a web fetch')` block after `describe('a typed web search')` (line 810), mirroring its three cases:

- a request on a navigator built with tokens runs `webFetch` once with the command and exactly `{ tokens, fetch: globalThis.fetch }`. The deps have no own `signal`, `reportDisabled`, or `now`, and the reply carries the mocked text;
- a navigator built without tokens passes `tokens: {}`;
- a rejected `webFetch` answers as an error reply carrying its message and no `result`.

`src/remote/protocol.test.ts`:

- the round-trip frame list (the `web-search` frame is `request: 'q4'`, line 409 today) gains a valid `web-fetch` frame;
- the malformed-frame table (beside `'filesystem request with out-of-range web search arguments'`, line 620) gains a `web-fetch` frame with `timeoutSeconds: 0` and one with an `ftp:` URL. Each decodes to `Malformed remote frame "filesystem-request".`.

## Out of scope

- The near-side sender, the long-running deadline, the protocol version bump, and the `product/specs/remote-server.md` description of the operation (subplan 19). Nothing reaches this operation before then, so no spec or user doc changes here.
- The tab adapter that chooses the remote side (subplan 21).
- The far-side ACP loop's fetch (subplan 25), which calls `webFetch` directly rather than through this operation.
- Any edit to `src/remote/filesystem/operations.ts`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `npm run test:server -- src/remote` so the operation, frame, and navigator suites all run even where `--changed` would skip one. Confirm with ESLint, using the `max-lines` rule at `max: 1`, that `operations.ts` still counts 200 and `web-fetch-operation.ts` stays far under the limit.

Nothing sends `web-fetch` yet, so there's no manual fetch check until subplan 21. On a remote tab against a peer built from this change, `web search vitest` still answers.
