# Web fetch 20 — one `web` entry point, bare-`web` usage, and the provider notice

**Complexity: 6/10** — 10 requirements, 17 test scenarios, ~38 added lines across 4 edited files and 2 new modules (p=5.87)

Run order: 20 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Bare `web`" and "Disabled providers" decisions, the first and last bullets of "Wiring into existing registries", the `run-prompt.ts` half of its `runWorkspace` bullet, and the bare-`web` and notification parts of "Documentation"). Depends on:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, which creates `src/web/command-line.ts` (holding only `isWebCommandLine`, with no imports) and moves the search adapter to `src/web/search/tab-search.ts`;
- `product/plans/ready/web-fetch-3-search-only-resolution.md` and `product/plans/ready/web-fetch-12-local-redirects-and-catalog.md`, which make search consider only search-capable providers and add the fetch-only `local` provider, so `web search --provider local` prints the unknown-provider line this plan's spec text describes;
- `product/plans/ready/web-fetch-13-fetch-parser.md`, which provides `WEB_FETCH_USAGE` in `src/web/fetch/command.ts`;
- `product/plans/ready/web-fetch-15-fetch-core.md`, which makes search and fetch share one disabled set through `webProviderRegistry`.

Today the `web` command and the ACP run path both call the search adapter directly, so every `web …` line is a search. This plan puts one `web` tab entry point in front of both subcommands, which keeps the typed and agent paths from diverging. Bare `web` and unknown `web` subcommands print both usage lines. The disabled-provider notification is also renamed, because a provider now serves both commands. Subplan 21 routes `web fetch` to its own adapter through this entry point, and subplan 25 reuses the subcommand split on the far side.

Paths below are post-subplan-1. At today's baseline the search adapter is `src/web-search/tab-search.ts` and `isWebCommandLine` is in `src/web-search/command.ts:128`. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Shared subcommand split.** `src/web/command-line.ts` gains two exports beside `isWebCommandLine`:
  - `webSubcommand(line)` returns `'search'`, `'fetch'`, or `undefined`. It trims the line and splits it on `/\s+/`, exactly as `parseWebSearch` does (`src/web/search/command.ts`, `input.trim().split(/\s+/)`), and lowercases the second word. It returns that word when it is exactly `search` or `fetch`, and `undefined` otherwise, including when there is no second word. So `web searching x` is `undefined`. It doesn't check the first word, because every caller has already claimed the line with `isWebCommandLine`. It's pure, with no I/O.
  - `WEB_USAGE` is `WEB_SEARCH_USAGE` and `WEB_FETCH_USAGE` joined by one `\n`, search first, with no trailing newline.
  To build `WEB_USAGE`, the file now imports `WEB_SEARCH_USAGE` from `./search/command.js` and `WEB_FETCH_USAGE` from `./fetch/command.js`. Neither module imports `command-line.ts`, so this forms no cycle. Subplan 25's far-side loop reuses both exports, so the names and the file are fixed.
- **Bare `web` (source plan, Bare `web`).** Bare `web`, and any `web <word>` other than `search` or `fetch`, prints `WEB_USAGE` and sends nothing. A malformed `web search …`, including bare `web search`, still prints only `WEB_SEARCH_USAGE`, because the line goes to `searchWebInTab` and `parseWebSearch` answers it. Until subplan 21 lands, a `web fetch …` line also prints `WEB_USAGE`; subplan 21 makes a malformed one print only `WEB_FETCH_USAGE`.
- **The entry point (source plan, Wiring).** A new `src/web/tab-web.ts` exports `runWebInTab(managers, label, input, signal?)`, returning `Promise<string>`. When `webSubcommand(input)` is `'search'`, it returns `searchWebInTab(managers, label, input, signal)` from `./search/tab-search.js`, passing the input and signal through unchanged. Every other result, `'fetch'` included for now, resolves to `WEB_USAGE` without touching the tab, a port, or a provider. Write it as a plain `if` with no `'fetch'` branch; subplan 21 adds that branch. A rejection from `searchWebInTab`, such as an abort, propagates unchanged.
- **Both callers use it.** These are the only two production callers of `searchWebInTab` (checked with `git grep`):
  - `src/commands/web.ts`: `run` calls `runWebInTab(managers, tab.label, command_)` in place of `searchWebInTab(…)` (today `:15`), with no signal, because a typed command has no cancellation. The `searchWebInTab` import is replaced by `runWebInTab` from `../web/tab-web.js`. `match` and `samples` don't change.
  - `src/acp/run-prompt.ts`: `runWorkspace` keeps its one `isWebCommandLine(normalized)` branch (today `:98`) and calls `runWebInTab(managers, label, command, request.abort.signal)` in place of `searchWebInTab`. It still passes `command`, not `normalized`, as today, so no other routing changes. The `searchWebInTab` import becomes `runWebInTab` from `../web/tab-web.js`.
  `src/remote/serve-acp-loop.ts` (`searchWorkspaceCommand`) doesn't call the tab adapter and isn't touched here; subplan 25 generalises it.
- **Notification text (source plan, Disabled providers).** A new `src/web/disabled-notice.ts` exports `reportProviderDisabled(managers, label)`. It returns a `(name: string, reason: string) => void` callback that calls `notify(managers, 'plugin-failure', label, …)` from `src/notifications/index.ts` with the text `Web provider "<name>" disabled: <reason>.`. Calling `reportProviderDisabled` itself notifies nothing. In `searchWebInTab`, `reportDisabled: reportProviderDisabled(managers, label)` replaces the inline `reportDisabled` arrow function, the one that calls `notify` with the `Web search provider "${name}" disabled: ${reason}.` template (today `src/web-search/tab-search.ts:30`–`32`), and the now-unused `notify` import goes. Subplan 21's fetch adapter uses the same callback, so the text has one definition. The registry already calls `reportDisabled` only once per provider, so neither adapter adds deduplication. A remote search passes no reporter and posts nothing, as today.
- **File size.** Every touched file stays far under the 200-line `max-lines` limit: `run-prompt.ts` is 145 lines and loses one import line, `tab-search.ts` is 34 and shrinks, `commands/web.ts` is 18, and the two new modules are about 10 lines each.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| `web` line predicate | `isWebCommandLine` in `src/web/command-line.ts` (subplan 1) | Already claims every `web …` line; its callers gate before the entry point |
| Search usage and parser | `WEB_SEARCH_USAGE`, `parseWebSearch` in `src/web/search/command.ts` | First half of `WEB_USAGE`; the split rule `webSubcommand` copies |
| Fetch usage | `WEB_FETCH_USAGE` in `src/web/fetch/command.ts` (subplan 13) | Second half of `WEB_USAGE` |
| Search adapter | `searchWebInTab` in `src/web/search/tab-search.ts` | Dispatched to; uses the shared notice |
| Notifications | `notify` with `'plugin-failure'` in `src/notifications/index.ts` | The notice; `notificationText` in `src/notifications/format.ts` prints a `plugin-failure` detail as given |
| `web` command | `src/commands/web.ts` | Calls the entry point |
| ACP workspace dispatch | `runWorkspace` in `src/acp/run-prompt.ts` | Calls the entry point |
| Adapter tests | `src/web/search/tab-search.test.ts` (its `vi.hoisted` mocks and `vi.mock` layout) | Pattern for `tab-web.test.ts` |

## Proposed changes

Land these as one change. Typecheck stays green only when both callers and their test mocks move together.

- `src/web/command-line.ts`: add `webSubcommand` and `WEB_USAGE` and their two imports.
- `src/web/disabled-notice.ts` (new): `reportProviderDisabled`. It imports `type Managers` from `../managers.js` and `notify` from `../notifications/index.js`.
- `src/web/tab-web.ts` (new): `runWebInTab`. It imports `type Managers` from `../managers.js`, `webSubcommand` and `WEB_USAGE` from `./command-line.js`, and `searchWebInTab` from `./search/tab-search.js`.
- `src/web/search/tab-search.ts`: use `reportProviderDisabled` from `../disabled-notice.js`.
- `src/commands/web.ts` and `src/acp/run-prompt.ts`: call `runWebInTab`.

## Tests

- `src/web/command-line.test.ts` (created by subplan 1), new `describe` blocks:
  - `webSubcommand` returns `undefined` for `web`, `'search'` for `web search x`, `'fetch'` for `WEB Fetch x`, `undefined` for `web foo` and `web searching x`, and `'search'` for `  web   search  x` with extra whitespace;
  - `WEB_USAGE` is `WEB_SEARCH_USAGE`, one newline, then `WEB_FETCH_USAGE`, each imported from its own module.
- `src/web/tab-web.test.ts` (new). Mock `./search/tab-search.js` with a hoisted `searchWebInTab` spy, as `tab-search.test.ts` mocks `./search.js`. Pass `{} as never` for managers, because the entry point reads nothing from them. Cases:
  - `web search x` with a signal calls `searchWebInTab(managers, 'janus', 'web search x', signal)` once and returns its result;
  - without a signal the fourth argument is `undefined`;
  - `WEB Search x` dispatches too;
  - bare `web search` dispatches, so the adapter answers with the search usage line;
  - `web`, `web foo`, and `web fetch https://example.com` each resolve to `WEB_USAGE` without calling the adapter;
  - a rejection from the adapter rejects `runWebInTab` with the same error.
- `src/web/disabled-notice.test.ts` (new), with `../notifications/index.js` mocked: the callback from `reportProviderDisabled(managers, 'janus')` calls `notify` once with `(managers, 'plugin-failure', 'janus', 'Web provider "tavily" disabled: provider failed: boom.')`, and creating the callback calls nothing.
- `src/web/search/tab-search.test.ts`: the notification case expects `Web provider "tavily" disabled: provider failed: boom.`. Its `vi.mock` of `../../notifications/index.js` still applies, because `disabled-notice.ts` imports the same module. Its usage-line cases for `web` and `web foo` stay, because `searchWebInTab` itself is unchanged.
- `src/commands/web.test.ts`: the hoisted spy and the `vi.mock` move from `searchWebInTab` in `../web/search/tab-search.js` to `runWebInTab` in `../web/tab-web.js`. `run` calls `runWebInTab(managers, 'janus', 'web search x')` with exactly three arguments and appends the input and output once. Bare `web` is passed through unchanged and its mocked output appended. The both-lines output itself is pinned in `tab-web.test.ts`, because this suite mocks the entry point.
- `src/acp/run-prompt.test.ts`: the hoisted `searchWebInTab` field becomes `runWebInTab`, and `vi.mock('../web/search/tab-search.js', …)` becomes `vi.mock('../web/tab-web.js', () => ({ runWebInTab: mocks.runWebInTab }))`. Repoint every `mocks.searchWebInTab` reference (12 today, in the web-search grant tests and the `runCorePrompt web routing` block). TypeScript doesn't check a `vi.mock` path, so a missed one silently stops mocking. The existing cases then pin that a workspace `web search` step, bare `web`, and `web foo` reach `runWebInTab` with the prompt's abort signal.

## Out of scope

- The fetch adapter and its dispatch branch, and the typed `web fetch` spec and help sections (subplan 21).
- Completion of `fetch` (subplan 22).
- The far-side loop: until subplan 25, a remote-hosted loop still answers bare `web` with only `WEB_SEARCH_USAGE`, and `src/remote/serve-acp-loop.test.ts` keeps expecting that.
- Agent vocabulary, grants, and reply lines (subplans 23 and 24).

## Documentation

Write the end state for each of these, naming `fetch` as a known subcommand even though subplan 21 makes it run.

- `product/specs/web-search.md` gets four updates:
  - "Command grammar" (today `:13`): bare `web` and any `web <word>` other than `search` or `fetch` print the `web search` usage line and then the `web fetch` usage line, one per line, and send nothing. Drop bare `web` from the list of malformed forms that print only the search usage line, which keeps bare `web search`.
  - "Provider selection" (today `:37`–`:39`): search considers only providers that declare search. The fetch-only `local` provider is never tried, and `web search --provider local` prints the unknown-provider line, whose list stays `auto, tavily, tinyfish`.
  - "Disabled providers" (today `:69`): the disabled set is shared with `web fetch`. A provider disabled by a fetch is skipped by `auto` and refused by an explicit search with its stored `Web search failed (<name>): <reason>.` line, and the other way round.
  - "Disabled providers" (today `:71`): the notification text becomes `Web provider "<name>" disabled: <reason>.`, posted when a local search or fetch disables a provider.
- `product/specs/notifications.md`, the `plugin-failure` bullet (today `:244`–`:245`): the `Web search provider "<name>" disabled: <reason>.` text becomes `Web provider "<name>" disabled: <reason>.`, raised when a local `web search` or `web fetch` disables a provider, attributed to the tab it ran in.
- `help/web.md`:
  - "Errors" (today `:28`): bare `web` and any other `web <word>` print both usage lines; bare `web` leaves the list of malformed forms for the search usage line.
  - The unknown-provider bullet (today `:34`): the name is not a search provider; `local` fetches only, so `--provider local` prints this line too.
  - "Providers" (today `:46`): the notification text becomes `Web provider "<name>" disabled: <reason>.`, and a provider disabled by either `web search` or `web fetch` is disabled for both.
- `documentation/developer-documentation/web-search-providers.md`, the plugin-failure paragraph (today `:176`): `Web search provider "<id>" disabled: <reason>.` becomes `Web provider "<id>" disabled: <reason>.`, and the sentence says a local search or fetch posts it through `reportProviderDisabled` in `src/web/disabled-notice.ts`. Leave subplan 15's shared-registry sentence in that paragraph as it is.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/web src/commands src/acp` so the entry-point, adapter, command, and run-prompt suites run even where `--changed` would skip one. Confirm `git grep -n "Web search provider" -- src product help documentation` finds nothing, and `git grep -n "searchWebInTab" -- src` finds only `src/web/search/tab-search.ts`, its test, and `src/web/tab-web.ts` with its test.

Then, in a shell tab:

- bare `web` and `web foo` each print the `web search` usage line and then the `web fetch` usage line;
- `web search` alone prints only the search usage line;
- `web search vitest` still searches.
