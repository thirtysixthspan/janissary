# Web fetch 22 — command-bar completion for `web fetch`

**Complexity: 5/10** — 11 requirements, 14 test scenarios, ~38 added lines in 2 edited files (p=5.62)

Run order: 22 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Completion" decision under "Command and grammar", the `src/completion/web.ts` bullet under "Wiring into existing registries", the completion part of step 5 of "Order of work", `src/completion/web.test.ts` under "Tests", and the `tab-completion.md` and `command-bar/tab-completion.md` parts of "Documentation"). Depends on these earlier subplans:

- `product/plans/ready/web-fetch-1-rename-web-directory.md`, for the `src/web/` layout and the `../web/search/search.js` import it gives `src/completion/web.ts`;
- `product/plans/ready/web-fetch-3-search-only-resolution.md`, which makes `webSearchProviderNames()` list only search-capable providers;
- `product/plans/ready/web-fetch-12-local-redirects-and-catalog.md`, for `localManifest` and the `webProviderCatalog` export in `src/web/providers/catalog.ts`;
- `product/plans/ready/web-fetch-15-fetch-core.md`, for `webFetchProviderNames()` in `src/web/fetch/fetch.ts`, which this plan is the first production caller of;
- `product/plans/ready/web-fetch-21-fetch-tab-adapter.md`, which makes `web fetch` a typed command and creates `product/specs/web-fetch.md`, the spec this plan adds a section to.

The command bar completes `web` to `search` today, and then the search flags and their values. This plan adds `fetch` and its flags. It also gates each subcommand by its own completion-policy check, so disabling one no longer hides the other.

Paths below are post-subplan-1. At today's baseline `src/completion/web.ts` imports `webSearchProviderNames` from `../web-search/search.js` (`:5`), and `src/web/fetch/fetch.ts` doesn't exist yet. Grep for the quoted identifier rather than trusting a line number.

## Design decisions

- **Subcommands (source plan, Completion).** `WEB_SUBCOMMANDS` in `src/completion/web.ts` (`:7`, `const WEB_SUBCOMMANDS = ['search'];`) becomes `['search', 'fetch']`. At the first argument, `completeWebCommand` offers each word whose `web <word>` the policy allows, through the filter it already has (`:37`). `completeWord` (`src/completion/helpers.ts:53`) sorts its matches with `localeCompare`, so `web ` lists `fetch` before `search`.
- **Per-subcommand gate.** Today a single `if (!policy.allows('web search')) return unchanged(cursor);` (`:35`) sits ahead of everything, and `if (preceding[1]?.toLowerCase() !== 'search') return unchanged(cursor);` (`:39`) follows the first-argument branch. Replace both. Keep the `command !== 'web'` null return and the first-argument branch as they are, with no gate in front of the first-argument branch. Then read the subcommand as `preceding[1]?.toLowerCase()`, so `WEB Fetch x -` completes like `web fetch x -`, and branch on it:
  - `search` continues to `completeSearchArgument(cursor)` only while `policy.allows('web search')`, and otherwise returns `unchanged(cursor)`;
  - `fetch` continues to `completeFetchArgument(cursor)` only while `policy.allows('web fetch')`, and otherwise returns `unchanged(cursor)`;
  - anything else under `web`, including a missing subcommand, returns `unchanged(cursor)`.
  The policy argument is always the lowercase literal `web search` or `web fetch`, never the typed words.
- **What the policy resolves to.** `completionPolicy` (`src/completion/command-policy.ts`) answers through `disabledApplicationCommand` (`src/native-commands/policy.ts`), which resolves the input with `resolveApplicationCommand` in `src/application-commands.ts`. `web search` resolves to its native row, whose effective setting is off when either it or its `web` parent is off. Until subplan 24 adds the native `web fetch` row, `web fetch` resolves to the builtin `web` row, so before then fetch completion can be hidden only by disabling `web`. After subplan 24 it resolves to its own row with no change here. Either way a disabled `web` row disables both subcommands.
- **The outer gate stays.** `completeCommandLine` in `src/completion/index.ts` (`:70`, `if (!prefix.startsWith('!') && !policy.allows(prefix)) return unchanged(cursor);`) already checks the words before the cursor before any handler runs. Keep it. The in-handler checks are what make the first-argument filter and the per-subcommand gate hold when `completeWebCommand` is called on its own, as its tests call it.
- **Fetch arguments.** A new private `completeFetchArgument(cursor)`, beside `completeSearchArgument` and with a comment shaped like that function's, reads `previous` as `cursor.preceding.at(-1) ?? ''` and behaves like this, in this order:
  - after `--format`, it offers `markdown`, `text`, and `html` from a new module constant `FORMAT_VALUES`, written like `DEPTH_VALUES`. It doesn't import a list from the parser, because subplan 13 keeps its format set module-private;
  - after `--provider`, it offers `['auto', ...webFetchProviderNames()]`, so `auto`, `tavily`, `tinyfish`, and `local`. It lists every fetch-capable id whether or not that provider has a token or is disabled, as search lists its providers today;
  - after `--timeout`, `--max-chars`, or `--offset`, it returns `unchanged(cursor)`;
  - a word starting with `-` at argument index 3 or later, so after the URL, offers the fetch flags not already used, from a new `FETCH_FLAGS` constant: `--format`, `--timeout`, `--max-chars`, `--offset`, and `--provider`. Sorted, they show as `--format`, `--max-chars`, `--offset`, `--provider`, `--timeout`;
  - every other word returns `unchanged(cursor)`. That covers the URL itself and a dash at the URL position (`web fetch -`).
  Value completion keys only on the previous word, exactly as `completeSearchArgument` does. So `web fetch --format ` still offers the formats, even though the parser refuses a flag before the URL. Flag names and values match case-sensitively and are offered in lowercase only, like every other completion. The parser accepts `--format MARKDOWN`, but completion never offers it.
- **Shared unused-flag step.** The dash branch is the same in both subcommands. Move today's lines 19 to 22 of `completeSearchArgument` (the `cursor.token.startsWith('-') && cursor.argumentIndex >= 3` check, the `used` set built from `cursor.preceding.slice(2)`, and the filtered `completeWord`) into one private `completeUnusedFlag(cursor, flags)`. It returns the completion when the token starts with `-` at argument index 3 or later, and `unchanged(cursor)` otherwise. Both argument functions end by returning it, so each subcommand's last two branches collapse into one call. Rename `WEB_FLAGS` (`:8`) to `SEARCH_FLAGS`, so the two flag lists read as siblings. Search output doesn't change. Without the shared step, the two dash branches would be near-copies that `npm run duplication` (jscpd, `.jscpd.json`: 5 lines and 50 tokens) could report.
- **Search stays search-only.** `web search --provider` keeps offering `auto` and `webSearchProviderNames()`. After subplan 3 that lists only search-capable providers, so it never includes `local`, with no change in this file.
- **No activation (`ai/guidelines/plugins.md` §3 and §6).** `webFetchProviderNames()` returns the registry's `fetchProviderNames()`, which reads only the static catalog declarations (subplans 4 and 15). Completing provider names never activates a provider module.
- **No filesystem fallback.** For a `web` cursor, `completeWebCommand` never returns `null`. So no `web` line falls through to `completeFilePath` in `completeCommandLine`.
- **Imports and size.** Add `import { webFetchProviderNames } from '../web/fetch/fetch.js';` beside the `webSearchProviderNames` import. `fetch.ts` and the modules it imports never import `src/completion/`, so this forms no cycle. `src/completion/web.ts` is 41 lines today and lands near 60, far under the 200-line `max-lines` limit. `src/completion/index.ts` is 92 lines and changes only a comment. Every flag string stays under the five repeats `sonarjs/no-duplicate-string` warns at. `--max-chars` and `--provider` each appear four times: once in each flag list and once in each value branch.
- **Comments.** The doc comment above `completeWebCommand` says it offers `search` and `fetch` while the policy allows each, and then the arguments of whichever subcommand the policy allows. In the module comment of `src/completion/index.ts`, the `For \`web search\`` bullet (`:47`) becomes a `web` bullet. It says `web` completes the `search` and `fetch` subcommands the policy allows. For `web search` it completes the unused flags after the query and the `--depth` and `--provider` values. For `web fetch` it completes the unused flags after the URL and the `--format` and `--provider` values. The query, the URL, and numeric values get no candidates and no path fallback.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Web completion | `completeWebCommand`, `completeSearchArgument`, `WEB_SUBCOMMANDS`, `WEB_FLAGS`, `DEPTH_VALUES` in `src/completion/web.ts` | Gains the fetch branch and the per-subcommand gate |
| Per-subcommand precedent | `completeFileReadCommand` in `src/completion/file-read.ts` (`FILE_SUBCOMMANDS.filter((word) => policy.allows(\`file ${word}\`))`, then one branch per subcommand) | Shape of the subcommand branching |
| Helpers | `completeWord` in `src/completion/helpers.ts` (sorted matches); `unchanged` in `src/completion/candidates.ts` | Candidates and the no-candidate result |
| Policy | `ALL_ENABLED_POLICY`, `CompletionPolicy`, `completionPolicy` in `src/completion/command-policy.ts` | Per-subcommand gate |
| Provider names | `webFetchProviderNames` in `src/web/fetch/fetch.ts` (subplan 15); `webSearchProviderNames` in `src/web/search/search.ts` | Values for `--provider` |
| Catalog | `webProviderCatalog`, `localManifest` in `src/web/providers/catalog.ts` (subplan 12) | Spied on in the activation test |
| Tests | `src/completion/web.test.ts` (`at`, `policyWith`); `src/completion/index.test.ts` (`completeCommandLine — web command`, its `report.txt` fixture) | Extended |

## Proposed changes

Land these as one change, with their tests.

- `src/completion/web.ts`: the subcommand list, `FETCH_FLAGS`, `FORMAT_VALUES`, the `SEARCH_FLAGS` rename, `completeUnusedFlag`, `completeFetchArgument`, the per-subcommand gate, the import, and the doc comment.
- `src/completion/index.ts`: the module comment.

## Tests

`src/completion/web.test.ts`. Assert `matches` in sorted order, because `completeWord` sorts. Three existing cases change, because their expectations stop being true:

- `'completes the search subcommand'` becomes a subcommands case: `web ` offers `['fetch', 'search']`, `web s` completes to `web search `, and `web f` completes to `web fetch `.
- `'completes nothing when the web search row is disabled'` is replaced by three cases:
  - with `policyWith({ 'web search': { enabled: false } })`, `web ` offers `['fetch']`, `web search x -` is unchanged with no matches, and `web fetch https://x -` still offers the five fetch flags;
  - with a hand-built `CompletionPolicy` whose `allows` is false only for `web fetch` (no real row can disable fetch alone until subplan 24), `web ` offers `['search']`, `web fetch https://x -` is unchanged with no matches, and `web search x -` still offers the four search flags;
  - with `policyWith({ web: { enabled: false } })`, `web ` offers nothing, and `web search x -` and `web fetch https://x -` are both unchanged with no matches.
- `'offers nothing for the query, the numeric values, and another web subcommand'` uses `web foo ` in place of `web fetch `, including in its `not.toBeNull()` check.

New cases:

- `web fetch https://x -` offers `['--format', '--max-chars', '--offset', '--provider', '--timeout']`; `web fetch https://x --format text -` leaves `--format` out; and `web fetch https://x --t` completes to `web fetch https://x --timeout `.
- `web fetch -` is unchanged with no matches, because a dash at the URL position isn't a flag.
- `web fetch https://x --format ` offers `['html', 'markdown', 'text']`, and `--format m` completes to `… --format markdown `.
- `web fetch https://x --provider ` offers `['auto', 'local', 'tavily', 'tinyfish']`, `--provider t` offers `['tavily', 'tinyfish']`, and `--provider l` completes to `… --provider local `.
- `web fetch `, `web fetch https://exa`, `web fetch https://x --timeout `, `--max-chars `, `--offset `, and `--offset 1` are each unchanged with no matches, and none returns `null`.
- `WEB Fetch https://x -` offers the five fetch flags.

Two existing cases stay as they are and keep pinning behavior:

- `'completes auto and every registered provider name'` still expects exactly `['auto', 'tavily', 'tinyfish']` for `web search x --provider `. Now that the catalog lists `local` (subplan 12), that pins that search never offers it.
- `'does not activate a provider when completing provider names'` spies on every `webProviderCatalog` manifest's `activate`, `localManifest` included, in place of the two named spies. It completes both `web search x --provider ` and `web fetch x --provider `, asserts that no spy was called, and restores every spy. The import changes from `tavilyManifest` and `tinyfishManifest` to `webProviderCatalog`.

`src/completion/index.test.ts`, in `describe('completeCommandLine — web command')`: `web fetch rep` is unchanged with no matches, although the fixture directory holds `report.txt`. That pins that a fetch URL word never falls back to filesystem completion.

## Out of scope

- The native `web fetch` row and its settings (subplan 24). The gate needs no change when the row arrives.
- Completing a URL, or the values of `--timeout`, `--max-chars`, and `--offset`.
- Offering uppercase flag or value spellings.

## Documentation

Each doc describes what is true once this plan lands. None names a subplan.

- **`product/specs/tab-completion.md`, "Web command (`web search`)" (`:92`–`:96`).**
  - The heading becomes `### Web command (\`web search\`, \`web fetch\`)`.
  - Candidates: the first argument offers `search` and `fetch`, each while the row its `web <word>` line resolves to is enabled. After `web search`, the existing text stays. After `web fetch`, a word starting with `-` offers the flags not already used (`--format`, `--timeout`, `--max-chars`, `--offset`, and `--provider`), but only after the URL, so `web fetch -` leaves the line unchanged. After `--format` it offers `markdown`, `text`, and `html`. After `--provider` it offers `auto` and every fetch-capable provider name, `local` included. `web search`'s `--provider` lists only search-capable providers, so it never offers `local`.
  - Behavior: the URL and the values of `--timeout`, `--max-chars`, and `--offset` join the list of words that get no candidates and don't fall back to filesystem completion. Replace `With the \`web\` row or the \`web search\` row disabled, nothing under \`web\` completes.` with three facts. With the `web` row disabled, nothing under `web` completes. A subcommand whose row is disabled isn't offered, and its arguments get no candidates. The other subcommand still completes.
- **`product/specs/web-fetch.md` (created by subplan 21).** Add a `### Completion` section between "Command grammar" and "Settings", matching where `product/specs/web-search.md` puts its own. In one paragraph: the command bar completes `web` to `fetch` while the `web fetch` line's row is enabled. After the URL it completes the flags not yet used, then the values of `--format` (`markdown`, `text`, `html`) and `--provider` (`auto` and the fetch-capable provider ids, `local` included). It never completes the URL or a numeric value, and nothing under `web fetch` falls back to path completion. Name `completeWebCommand` in `src/completion/web.ts`, and end with `see [[tab-completion]] for the detail`, as `web-search.md` does.
- **`product/specs/web-search.md`, "Completion" (`:17`).** `completes \`web\` to \`web search\`` becomes `completes \`web\` to \`search\` and \`fetch\``. Add that `--provider` lists only search-capable providers, so it never offers `local`, and that search completion depends only on the `web search` row and its `web` parent, so a disabled fetch never hides it.
- **`documentation/user-documentation/command-bar/tab-completion.md`.**
  - The `After \`web\`` table row (`:30`) becomes `search` and `fetch`. Then, after a search query, the flags not yet used, `basic` and `advanced` after `--depth`, and `auto` and the provider names after `--provider`. After a fetch URL, the flags not yet used, `markdown`, `text`, and `html` after `--format`, and `auto` and the provider names after `--provider`.
  - After the `For \`web search\`` paragraph (`:43`), add one paragraph for `web fetch`. Flags appear only once the URL is on the line, so `web fetch -` leaves the line unchanged. After the URL, Tab offers the flags you haven't used: `--format`, `--timeout`, `--max-chars`, `--offset`, and `--provider`. The URL and the number values get no suggestions. After `--format` you get `markdown`, `text`, and `html`. After `--provider` you get `auto` and the provider names, `local` included, which `web search` never offers. A subcommand you turn off in the **Commands** tab isn't suggested, and neither are its flags, but the other one still is. Don't name a `web fetch` row, because the Commands tab has none until the agent tool lands. No file paths or function names, per `ai/guidelines/user-documentation.md`.

`help/web.md` says nothing about completion and doesn't change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run test:server -- src/completion` so both completion suites run even where `--changed` would skip one. Run `npx jscpd src/completion` and confirm it reports no clone inside `web.ts`.

Then, in a shell tab:

1. Type `web ` and Tab to see `fetch search`. Type `web f` and Tab to get `web fetch `.
2. Type `web fetch -` and Tab, and confirm nothing changes. Type `web fetch https://example.com --` and Tab to see `--format --max-chars --offset --provider --timeout`.
3. Type `web fetch https://example.com --provider ` and Tab to see `auto local tavily tinyfish`. Type `web search x --provider ` and Tab to see `auto tavily tinyfish`.
4. Type `web fetch https://example.com --format ` and Tab to see `html markdown text`. Type `web fetch https://example.com --timeout ` and Tab, and confirm nothing changes and no path appears.
5. In the Commands tab, disable `web search`. Confirm `web ` and Tab completes to `web fetch ` and `web fetch https://example.com --` still lists the fetch flags. Re-enable it, disable `web`, and confirm nothing under `web` completes. Then re-enable it.
