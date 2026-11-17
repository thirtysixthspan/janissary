# Web fetch 19 — the near-side `web-fetch` sender and protocol bump

**Complexity: 4/10** — 5 requirements, 8 test scenarios, ~25 added lines across 4 edited files (p=5.08)

Run order: 19 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Remote transport" and "Remote connection lines and cancellation" decisions, the near-side half of the remote-layer bullet under "Wiring into existing registries", and the sender half of step 7 of "Order of work"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/` layout. It points the `WebSearchCommand` imports in `port-reads.ts` and `port.ts` at `../../web/search/command.js`.
- `product/plans/ready/web-fetch-13-fetch-parser.md`, for `WebFetchCommand` in `src/web/fetch/command.ts` and its six field names: `url`, `format`, `timeoutSeconds`, `maxChars`, `offset`, `provider`.
- `product/plans/ready/web-fetch-17-remote-operation-extractions.md`, which leaves `src/file-navigator/remote/port.ts` at 195 counted lines or fewer so this plan has room.
- `product/plans/ready/web-fetch-18-remote-fetch-operation.md`, for the `'web-fetch'` member of `RemoteFilesystemOperation`, its `WebFetchCommand` argument type in `src/remote/protocol-frames.ts`, its `{ text }` result decoder, and the far-side handler. Without them, `request('web-fetch', …)` and the `LONG_RUNNING` entry don't typecheck.

The local side needs a way to send `web-fetch` to the remote host and wait long enough for a slow chain of attempts. A newer local side must also never pair with an older remote host that doesn't know the operation. This plan adds the sender, the port method, the long deadline, the protocol version bump, and the `product/specs/remote-server.md` text that subplan 18 left here. Subplan 21's tab adapter (`fetchWebInTab`, calling `port.webFetch(parsed)` inside `withRemoteTabPort(managers, label, 'web-fetch', …)`) is the first caller. Nothing in this plan calls `webFetch` on the port.

## Design decisions

- **Near-side sender (source plan, Remote transport).** Add `export async function remoteWebFetch(request: RemoteRequest, args: WebFetchCommand): Promise<string>` to `src/file-navigator/remote/port-reads.ts`, directly after `remoteWebSearch` (`export async function remoteWebSearch(request: RemoteRequest, args: WebSearchCommand)`). Copy its shape exactly. It calls `request('web-fetch', { … })` with an object literal naming the six fields one by one, in this order: `url`, `format`, `timeoutSeconds`, `maxChars`, `offset`, `provider`. Then it returns `result.text`. Never spread `args`. Listing the fields is what keeps an extra key on the caller's object off the wire, as `'sends exactly the five command fields and resolves to the reply text'` pins for search. The values go out unchanged. `url` stays as typed because subplan 16's cache keys on it. `format` is already lowercased by the parser. `provider` stays as typed, and the far side resolves it. Add `import type { WebFetchCommand } from '../../web/fetch/command.js';` beside the `WebSearchCommand` type import. `port-reads.ts` counts 96 lines, so it has plenty of room.
- **Port method.** Add `webFetch(args: WebFetchCommand): Promise<string>` to `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts`, directly after `webSearch(args: WebSearchCommand): Promise<string>`. Its body is `return remoteWebFetch(this.requester(), args);`, mirroring `webSearch`. Don't make it `async`, because `webSearch` isn't. Add `remoteWebFetch` to the existing multi-line `./port-reads.js` import block, between `remoteReadLines` and `remoteWebSearch`. Don't rewrap that block. No `max-len` rule exists in `eslint.config.mjs`, so the list stays on its one line. Add `import type { WebFetchCommand } from '../../web/fetch/command.js';` on its own line beside the `WebSearchCommand` type import. Use `import type`, per `@typescript-eslint/consistent-type-imports`.
- **Concrete port only.** `webSearch` lives on `RemoteFileSystemPort` alone. It isn't part of the `FileSystemPort` interface in `src/file-navigator/filesystem-port.ts`, and `LocalFileSystemPort` has no counterpart. `webFetch` follows the same rule, because a local tab runs the core directly (subplan 21). Don't touch the interface, `LocalFileSystemPort`, or any test double typed as `FileSystemPort`.
- **Line budget.** `port.ts` gains exactly four counted lines: the three-line method and the one type import. Subplan 17 leaves it at 193 counted lines. If `file-patch` landed first, it leaves it at 195 or fewer. So `port.ts` ends at 197, or at most 199. If the measured count before you start is above 196, stop and report it. Don't compact anything to fit. That would mean subplan 17's extraction didn't land as planned.
- **Failure lines (source plan, Remote connection lines).** Subplan 18 gave the operation no `refusal` shape, so `refusalValueFor` in `src/remote/filesystem/refusal.ts` reports `classified: false`. Every unanswered request therefore rejects with a plain `Error` carrying its reason. The reasons come from `src/file-navigator/remote/port-requests.ts`:
  - The channel closes mid-request. It rejects with `ENDED_REASON`, `The remote connection ended.`
  - No reply arrives within the deadline. It rejects with `TIMED_OUT_REASON`, `The remote machine did not answer in time.`
  - The request is made after the port was disposed, or after its session failed to open. It rejects with `CLOSED_REASON`, `The remote file navigator is closed.`, and nothing is sent.
  - The far side replies with an error. It rejects with that error text unchanged.
  - The reply isn't a record with a non-empty `text` string. Subplan 18's decoder rejects it with `Invalid remote filesystem operation result.`
  The sender catches none of these. Subplan 21's adapter turns a rejection into its printed line with `errorText`, as `searchRemote` in `tab-search.ts` does. A remote fetch has no cancellation, because no abort signal crosses the port.
- **Long-running (source plan, Remote transport).** Add `'web-fetch'` to `LONG_RUNNING` in `port-requests.ts`, directly after `'web-search'` on the same line. `requestDeadline('web-fetch')` then returns `LONG_REQUEST_DEADLINE_MS`, 600 seconds. That covers the 360-second worst case of three 120-second attempts, with room left for the network and the far side's own work. In the comment above `REQUEST_DEADLINE_MS`, change the closing list's `web searches` to `web searches and fetches`. The comment then names the new member.
- **Protocol version (source plan, Remote transport).** Raise `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` (`export const REMOTE_PROTOCOL_VERSION = 44;` today) by exactly one from whatever value it holds when this lands. The ready `file-patch` and `subagent` plans each bump it too, and whichever lands later takes the then-current value plus one. So the target is `45` only if neither has landed first. Below, `N` means the new value and `N−1` the previous one. Add a `// Version N …` paragraph directly below the version-44 paragraph and directly above the constant, in the same comment style. It says three things:
  - this version adds the read-only, path-free `web-fetch` operation;
  - a typed or agent `web fetch` on a remote tab therefore runs on the remote machine, with that workspace's tokens and that host's network;
  - a version-`N−1` remote would refuse the operation as unknown after the handshake had already passed, so the exact-version handshake refuses that pairing first.
  The version-44 paragraph's last two sentences are the wording to follow.
- **Land as one change.** The sender, the port method, the `LONG_RUNNING` entry, and the bump each typecheck on their own once subplan 18 is in. Land them together anyway. A build that can send `web-fetch` must always refuse a peer that can't answer it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Port sender | `remoteWebSearch` in `src/file-navigator/remote/port-reads.ts` | Exact model for `remoteWebFetch` |
| Port method | `webSearch` on `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts`; `requester()` there | Exact model for `webFetch` |
| Request type | `WebFetchCommand` in `src/web/fetch/command.ts` (subplan 13) | Sender argument |
| Operation, argument type, result decoder | `'web-fetch'` in `src/remote/protocol-frames.ts` and `src/remote/filesystem/result-decoders.ts` (subplan 18) | Types `request('web-fetch', …)` and `result.text` |
| Deadlines | `LONG_RUNNING`, `REQUEST_DEADLINE_MS`, `LONG_REQUEST_DEADLINE_MS`, `requestDeadline` in `src/file-navigator/remote/port-requests.ts` | Long deadline |
| Rejection reasons | `ENDED_REASON`, `TIMED_OUT_REASON`, `CLOSED_REASON` in `port-requests.ts`; `refusalValueFor` in `src/remote/filesystem/refusal.ts` | Failure lines, unchanged |
| Version history | the version-44 paragraph above `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` | House form for the new paragraph |
| Handshake refusal | `parseHandshake` in `src/remote/protocol.ts` (`Remote janissary speaks protocol version <n>; this one speaks <m>. …`) | Refuses the older peer; nothing to change |

## Proposed changes

- `src/file-navigator/remote/port-reads.ts`: the `WebFetchCommand` type import and `remoteWebFetch`.
- `src/file-navigator/remote/port.ts`: the `WebFetchCommand` type import, `remoteWebFetch` in the `./port-reads.js` import, and the `webFetch` method.
- `src/file-navigator/remote/port-requests.ts`: the `LONG_RUNNING` entry and the comment's `web searches and fetches`.
- `src/remote/protocol.ts`: the bump and its `Version N` paragraph.

## Tests

`src/file-navigator/remote/port.test.ts` gets a `describe('RemoteFileSystemPort.webFetch')` block directly after `describe('RemoteFileSystemPort.webSearch')`. It reuses that block's `hasRequest` and `lastRequest` helpers, redeclared locally as the search block does. Its command is `{ url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10000, offset: 0, provider: 'auto' } as const`. The cases are:

- It sends exactly the six fields and resolves to the reply text. Call it with the command plus `extra: 'ignored'`. Expect the request to match `{ operation: 'web-fetch', args: command }`, and `Object.keys(args)` to equal `['url', 'format', 'timeoutSeconds', 'maxChars', 'offset', 'provider']`. Reply `{ text: 'Fetched https://example.com/page (local).' }` and expect that string.
- When the channel closes in flight, it rejects with `ENDED_REASON`. Copy the search block's case.
- A request after disposal rejects with `CLOSED_REASON` and sends nothing. Copy the search block's case.
- It waits for the long deadline. Use fake timers as `'rejects after the ordinary 60-second request deadline'` does for `grepFiles`. After `REQUEST_DEADLINE_MS + 1`, a settled flag set by the promise's handlers is still false. It rejects with `TIMED_OUT_REASON` once the clock passes `LONG_REQUEST_DEADLINE_MS`. Restore real timers in `finally`.
- A far-side error reply, `h.reply(undefined, 'Web fetch: boom.')`, rejects with exactly that message.

`src/file-navigator/remote/port-requests.test.ts`: in `'gives work the far side really does, like a pull, the long deadline'`, add `expect(requestDeadline('web-fetch')).toBe(LONG_REQUEST_DEADLINE_MS);` beside the `'web-search'` line.

`src/remote/protocol.test.ts`: in `describe('protocol version')`, change the case title `'is 44'` and its `toBe(44)` literal to the new value `N`. The existing `it.each` case `'rejects a remote speaking older protocol version %i'` builds its versions from `REMOTE_PROTOCOL_VERSION - 1`. So it already covers a version-`N−1` peer being refused, and needs no edit. The other suites that use the version (`src/remote/serve.test.ts`, `src/remote/channel/index.test.ts`, `src/remote/serve-start.test.ts`) read the constant rather than a literal, so they need no edit either.

## Out of scope

- The far-side operation, its validation, and its result decoder (subplan 18).
- The tab adapter that chooses the local or remote side, and its printed lines (subplan 21).
- The far-side ACP loop's fetch (subplan 25), which calls `webFetch` directly rather than through the port.
- Adding `webFetch` to the `FileSystemPort` interface or to `LocalFileSystemPort`.
- Cancelling a remote fetch.

## Documentation

`product/specs/remote-server.md` changes in three places:

- **Version history.** Add a `Protocol version N adds …` paragraph directly after the `Protocol version 44 adds …` paragraph. It describes `web-fetch` as the read-only, path-free filesystem operation behind `web fetch` on a remote tab, typed or agent. It carries `url` (an absolute `http:` or `https:` URL, kept as typed), `format` (`markdown`, `text`, or `html`), `timeoutSeconds` (1–120), `maxChars` (200–100000), `offset` (a whole number of 0 or more), and `provider` (any string; an unknown name gets resolution's refusal line). It answers `{ text }` holding the rendered page, the redirected-to line, a refusal, or the failure lines. Any other argument shape is an invalid request. The far side runs the fetch with the merged token set of the workspace it serves, forwarded tokens winning over the remote's own files. Its `local` provider reaches the remote host's network, and it never falls back to the machine running Janissary. It posts no notification, and a provider it disables stays disabled in the remote process until that process restarts. That process keeps its own fetch cache. A version-`N−1` peer would refuse the unknown operation only after connecting, so the handshake refuses it first. That paragraph's own `web-search` sentences are the model.
- **Deadlines.** The paragraph on lost replies lists the work that gets ten minutes. Its list includes "a web search that may fall back across providers". Add `a web fetch that may try several providers` directly after that item.
- **Token readers.** In the `.janissary/tavily-token` and `.janissary/tinyfish-token` paragraph, the far-side Janissary process reads them "for `web search`". Change that to "for `web search` and `web fetch`".

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `npm run test:server -- src/file-navigator/remote src/remote/protocol.test.ts`, so the port, deadline, and version suites all run even where `--changed` would skip one. Run ESLint with the `max-lines` rule at `max: 1` on `port.ts` and confirm it counts 199 or fewer. Expect 197 when `file-patch` hasn't landed.

Nothing on the local side calls `port.webFetch` until subplan 21, so there's no manual fetch check yet. Two manual checks apply now:

1. On a remote tab against a peer built from this change, `web search vitest` still answers.
2. Open a remote tab against a host whose installed Janissary is the previous build. The connection is refused with `Remote janissary speaks protocol version N−1; this one speaks N. Update janissary so both hosts match.`, using the actual numbers.
