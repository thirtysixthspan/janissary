# Web search 14: command-bar Tab completion for `web search`

**Complexity: 4/10** — ~55 added lines, 1 production file edited, 8 requirements, 11 test scenarios (p=5.25)

The fourteenth and last slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds `completeWebCommand` to the completion chain: `web ` completes to `web search` while the completion policy allows it, a word starting with `-` after the query completes to the flags not yet used, and the values of `--depth` and `--provider` complete from their fixed lists and the registry's provider names. Provider names come from the static manifests, so completion never imports a provider module.

## Dependencies

- `./product/plans/complete/web-search-6-search-core.md` — `webSearchProviderNames()` exported from `src/web-search/search.ts`, the module-level registry's `providerNames()` (manifest ids in catalog order: `tavily`, `tinyfish`), built over `webSearchProviderCatalog` from `src/web-search/providers/catalog.ts` (slice 5) without importing any provider module.
- `./product/plans/ready/web-search-10-typed-command.md` — the parentless `web` builtin row (`BUILTIN_FORMS` in `src/application-commands.ts`), and `product/specs/web-search.md`, which this slice adds a completion section to.
- `./product/plans/ready/web-search-12-acp-tool.md` — the native `web search` row, parented under `web`. Without it `policy.allows('web search')` resolves to the `web` row, so the "disabled `web search`" behavior and its test only exist once slice 12 has landed.

All 14 web-search slices ship on one pull request; this slice lands last. Nothing in slices 11 or 13 is needed here.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Completion (user decision).** Command-bar Tab completion completes `web` to `web search` (only while the completion policy allows `web search`, as `browser` subcommands are filtered today); after the query, a word starting with `-` completes to the flags not yet used (`--results`, `--max-chars`, `--depth`, `--provider`); the word after `--depth` completes to `basic` or `advanced`; and the word after `--provider` completes to `auto` and every registered provider name. Nothing is completed for the query or for `--results`/`--max-chars` values.
- **How `web` becomes `web search` (from the real chain).** A token with no space after it is argument 0 (`readCompletionCursor` in `src/completion/cursor.ts` gives `argumentIndex: preceding.length`), which `completeApplicationCommandName` (`src/completion/command-names.ts`, `if (cursor.argumentIndex !== 0 …) return null`) already completes from command names; `we` → `web ` needs nothing new. `completeWebCommand` handles argument 1: `web ` and `web s` complete to `web search ` through `completeWord(cursor, ['search'].filter(…))`, exactly as `completeBrowserCommand` filters `BROWSER_SUBCOMMANDS` with `policy.allows(\`browser ${word}\`)` (`src/completion/browser.ts`).
- **Provider names (decision).** The `--provider` candidates are `auto` followed by `webSearchProviderNames()` (slice 6; not the registry method `providerNames()` directly). Reading names reads manifests only (`ai/guidelines/plugins.md` §3, §6). `completeWord` (`src/completion/helpers.ts`) sorts its `matches` with `localeCompare`, so the displayed order is alphabetical, not catalog order; with today's catalog the two coincide (`auto`, `tavily`, `tinyfish`). Do not bypass `completeWord` to preserve catalog order.
- **Policy (decision).** `completeWebCommand(cursor, policy)` returns `unchanged(cursor)` for every argument of a `web` line when `policy.allows('web search')` is false, so it offers neither `search` nor flags nor values. In the full chain `completeCommandLine` (`src/completion/index.ts`) already returns `unchanged` before the chain when `!policy.allows(prefix)` — a disabled `web` row blocks everything under `web`, and a disabled native `web search` row blocks every argument after `web search` — but the function checks the policy itself so its unit tests hold without the chain, and so argument 1 (prefix `web`, which the `web` row allows) filters out `search`.
- **"After the query" (decision).** Arguments after `web search` are classified by the previous word first, then the token:
  - previous word exactly `--depth` → complete against `basic`, `advanced`;
  - previous word exactly `--provider` → complete against `auto` and the provider names;
  - previous word exactly `--results` or `--max-chars` → `unchanged`;
  - otherwise, when the token starts with `-` and at least one query word precedes it (`argumentIndex >= 3`) → complete against the four flags minus those already used;
  - otherwise (a query word, including a `-site:` word that matches no flag, and argument 2 before any query) → `unchanged`.
  Flag names match exactly and in lowercase, as the parser does (slice 1, "Flag names"), so "already used" means a word in `preceding` after `web search` that equals one of the four flags. `--depth` and `--provider` value candidates are lowercase and `completeWord` matches case-sensitively, as every other completion does; `--depth A` gets no candidate.
- **Return value: `unchanged`, not `null`, for `web` lines (decision, verified against the chain).** `completeCommandLine` ends with `return result ?? completeFilePath(cursor, cwd)`, so any `null` from the chain becomes filesystem completion. `completeWebCommand` returns `null` only when `cursor.command !== 'web'`; for every other `web` line it returns a result, `unchanged(cursor)` (`src/completion/candidates.ts`) where nothing applies — including any `web <other>` subcommand, as `completeFileReadCommand` returns `unchanged` for a subcommand other than `read`/`glob`. A query word therefore never completes to a filename. No earlier handler in the chain claims a `web` line (each checks its own `command`), so the position in the chain only matters relative to the `completeFilePath` fallback.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Completion chain | `src/completion/index.ts` (`completeCommandLine`, 81 counted lines; policy guard on `prefix`; `result ?? completeFilePath(cursor, cwd)`) | Add `completeWebCommand(cursor, policy)` to the `??` chain. |
| Subcommand filtering by policy | `src/completion/browser.ts` (`completeBrowserCommand`) | Model for argument 1 (`search` filtered with `policy.allows`). |
| Flag and value completion with `unchanged` | `src/completion/file-read.ts` (`completeFileReadCommand`, `completeGlobArgument`) | Model for the previous-word checks, flag candidates, and `unchanged` for value and pattern words; split the argument handling into its own function the same way to stay under `sonarjs/cognitive-complexity`. |
| Word completion | `src/completion/helpers.ts` (`completeWord`: filters by `startsWith`, sorts, single match gets a trailing space) | All candidate filling. |
| No-op result | `src/completion/candidates.ts` (`unchanged`) | Every "nothing applies" case. |
| Policy | `src/completion/command-policy.ts` (`CompletionPolicy`, `ALL_ENABLED_POLICY`, `completionPolicy`) | `policy.allows('web search')`; default parameter `ALL_ENABLED_POLICY` as `completeFileReadCommand` has. |
| Provider names | `src/web-search/search.ts` (`webSearchProviderNames`, slice 6) | `--provider` candidates. |
| Policy test helper | `src/completion/file-read.test.ts` (`policyWith` over `NativeCommandSettingsManager`), `src/completion/index.test.ts` (`policyWith(disabled)` over `listApplicationCommands()`) | Disabled-row policies in the new tests. |

## Proposed changes

All relative imports carry `.js`.

- **`src/completion/web.ts`** (new, ~45 counted lines) — exports `completeWebCommand(cursor: CompletionCursor, policy: CompletionPolicy = ALL_ENABLED_POLICY): CompletionResult | null` implementing the decisions above. Module-level constants for the subcommand list (`['search']`), the four flags, and the depth values (`basic`, `advanced`). The post-`search` argument rules go in an unexported helper, as `completeGlobArgument` is in `file-read.ts`. Imports `webSearchProviderNames` from `../web-search/search.js`; call it inside the `--provider` branch, not at module top level.
- **`src/completion/index.ts`** — import `completeWebCommand` from `./web.js` and add `completeWebCommand(cursor, policy) ??` directly after `completeFileReadCommand(cursor, fileReadRoot, policy) ??`. Add one bullet to the doc comment after the `file glob` bullet: "For `web search`, completes the subcommand, the flags not yet used after the query, and the values of `--depth` and `--provider`; the query and numeric values get no candidates and no path fallback." The file stays well under 200 lines.
- **`product/specs/tab-completion.md`** — a `### Web command (`web search`)` section after "### File command (`file read`, `file glob`)", in that section's Candidates/Behavior shape: argument 1 offers `search` only while `web search` is enabled; the four flag rules; `--provider` offers `auto` then every registered provider; nothing for the query, `--results`, `--max-chars` values, or other `web` subcommands, and no fallback to filesystem completion; a disabled `web` or `web search` row completes nothing under `web`.
- **`product/specs/web-search.md`** (created by slice 10) — a short "Completion" section that states the rules in one sentence and links `[[tab-completion]]` for the detail.
- **`documentation/user-documentation/command-bar/tab-completion.md`** — one row in the "Command-specific suggestions" table after the `browser` row: context "After `web`", candidates "`search`; after the query, the flags not yet used; after `--depth`, `basic` and `advanced`; after `--provider`, `auto` and the provider names".

## Tests

`src/completion/web.test.ts` (new), in the style of `src/completion/file-read.test.ts` (`const at = (line) => readCompletionCursor(line, line.length)`):

- `web ` offers `search` and `web s` completes to `web search `.
- A line whose command is not `web` returns `null`.
- With a policy disabling the native `web search` row (`policyWith({ 'web search': { enabled: false } })` as in `file-read.test.ts`), `web ` has no matches and `web search x -` returns unchanged with no matches.
- `web search node.js -` offers all four flags; with `--results 3` already on the line, `-` offers the other three; `--d` completes to `--depth `.
- `web search -` (no query yet) and `web search foo -site:x` return unchanged with no matches.
- `web search x --depth ` offers `basic` and `advanced`; `--depth a` completes to `advanced `.
- `web search x --provider ` offers `auto`, `tavily`, `tinyfish`; `--provider t` offers `tavily` and `tinyfish`.
- No candidates (unchanged, empty `matches`) for a query word and for the values of `--results` and `--max-chars`; `web foo ` returns unchanged, not `null`.
- Completing provider names does not activate any provider: `vi.spyOn` `activate` on `tavilyManifest` and `tinyfishManifest` (`src/web-search/providers/catalog.ts`) and assert neither spy is called after a `--provider ` completion.

`src/completion/index.test.ts` (existing), beside the other `completeCommandLine` cases:

- With `report.txt` in the test directory, `completeCommandLine('web search rep', …, dir)` leaves the line unchanged (no path fallback for a query word).
- With `policyWith(['web'])`, `completeCommandLine('web ', …)` offers nothing.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: in a scratch project, type `web ` and press Tab (expect `web search `); type `web search node.js -` and press Tab (expect the four flags); type `web search x --provider ` and press Tab (expect `auto`, `tavily`, `tinyfish`); type `web search rep` and press Tab (expect no change, even with a matching file). In the Commands tab, disable `web search` and confirm `web ` no longer completes.

## Out of scope

- Completing query text or numeric values (user decision).
- Case-insensitive value completion (`--depth A`); completion stays case-sensitive like every other handler.
- Any change to the command, the search core, the registry, or ACP (earlier subplans of `./product/plans/complete/web-search.md`).
