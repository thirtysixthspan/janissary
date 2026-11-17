# Web fetch 13 — the `web fetch` parser

**Complexity: 7/10** — ~155 added lines, 1 file edited, 18 requirements, 54 test scenarios, mostly one-line parser cases (p=6.59)

Run order: 13 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (sections "Command", "Usage line and argument ranges", "No `--prompt`", "One URL per call", the "Parser" bullet under "Fetch core", and the parser half of step 4 of "Order of work"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` (the `src/web/` layout, `src/web/search/command.ts`, and its `../../positive-integer.js` import) and `product/plans/ready/web-fetch-2-provider-capability-declarations.md` (`WebFetchFormat` in `src/web/providers/contract.ts`).

The fetch command needs a pure parser that turns a typed line into a request or into the usage line, with no I/O (`ai/guidelines/architecture-principles.md` §4). This plan adds it beside the search parser's shape, and moves the two flag-scan pieces both parsers need into one shared module so the fetch parser doesn't copy them. Nothing outside tests calls `parseWebFetch` until the tab adapter (subplan 21) and the far-side loop (subplan 25) arrive.

Paths below are the post-rename ones from subplan 1. Line anchors are the same in today's `src/web-search/command.ts`, because subplan 1 only removes `isWebCommandLine` from the end of that file (lines 128–130).

## Design decisions

- **Request type.** `WebFetchCommand` lives in a new `src/web/fetch/command.ts`. It has six fields:
  - `url`, a string kept exactly as typed, never normalized (the cache key in subplan 16 uses it as typed);
  - `format`, a `WebFetchFormat`, lowercased;
  - `timeoutSeconds`, a number;
  - `maxChars`, a number;
  - `offset`, a number;
  - `provider`, a string kept as typed (fetch resolution in subplan 5 lowercases it).
  Subplans 15, 18, and 19 use exactly these field names. The remote operation (subplan 18) carries exactly this shape.
- **Usage line (source plan, Usage line and argument ranges).** `WEB_FETCH_USAGE` is exactly `Usage: web fetch <url> [--format markdown|text|html] [--timeout <1-120>] [--max-chars <200-100000>] [--offset <n>] [--provider <name>]`. Subplan 20 joins it with `WEB_SEARCH_USAGE`, and subplan 23 derives the primer's grammar line from it, so it carries the `Usage: ` prefix and no trailing period.
- **Constants.** Export these beside the usage line, named like the search ones at `src/web/search/command.ts:13`–`27` (`WEB_SEARCH_MIN_CHARS`, `WEB_SEARCH_DEFAULT_MAX_CHARS`, `WEB_SEARCH_DEFAULT_DEPTH: WebSearchDepth`, …). Subplan 18 validates the remote arguments with the range ones, so the names are fixed here:
  - `WEB_FETCH_MIN_TIMEOUT_SECONDS` 1, `WEB_FETCH_MAX_TIMEOUT_SECONDS` 120, `WEB_FETCH_DEFAULT_TIMEOUT_SECONDS` 30;
  - `WEB_FETCH_MIN_CHARS` 200, `WEB_FETCH_MAX_CHARS` 100000, `WEB_FETCH_DEFAULT_MAX_CHARS` 10000;
  - `WEB_FETCH_MIN_OFFSET` 0, `WEB_FETCH_DEFAULT_OFFSET` 0;
  - `WEB_FETCH_DEFAULT_FORMAT`, typed `WebFetchFormat`, `markdown`;
  - `WEB_FETCH_DEFAULT_PROVIDER` `auto`.
- **Grammar (source plan, Command).** `parseWebFetch(input)` returns a `WebFetchCommand` or `{ error: WEB_FETCH_USAGE }`, shaped like `parseWebSearch` (`src/web/search/command.ts:111`). It trims the input, splits on `/\s+/`, and requires the first two words to be `web` and `fetch`, both matched case-insensitively, so `WEB FETCH https://x` parses. Any other line, including `web search https://x`, gets the fetch usage line; routing between subcommands is subplan 20's job, not the parser's. The third word is the URL, and it must not start with `--`. Every word after it must be a flag followed by its value, in any order.
- **Flag names are exact.** Flags match only in lowercase, as search's `scanFlag` (`src/web/search/command.ts:78`) does with its `switch (flag)`. So `--FORMAT text` is an unknown flag. Only the `--format` value is case-insensitive.
- **Shared flag scan.** `flagValue` (`src/web/search/command.ts:43`) and the `scanArguments` loop (`src/web/search/command.ts:98`) are private to the search parser today. Copying them verbatim into the fetch parser would be a clone that `npm run duplication` (jscpd, `minLines` 5, `minTokens` 50 in `.jscpd.json`) reports. So move both into a new `src/web/flag-scan.ts`, with no imports:
  - `flagValue(value)` keeps its body: `undefined` for a missing value or one starting with `--`, otherwise the value.
  - `scanFlagArguments(words, scanned, scanFlag)` is `scanArguments` made generic over the scanned-values object. It takes the words after the positional part, a fresh object to fill, and the command's own `scanFlag(scanned, flag, value)`, which returns the number of words consumed or `undefined` to refuse. It refuses any word that doesn't start with `--`, advances by what `scanFlag` returns, and returns the filled object, or `undefined` on the first refusal.
  The search parser imports both from `../flag-scan.js` and its `ScannedArgs` and `scanFlag` stay where they are. Search behavior doesn't change. The fetch parser imports both the same way.
- **Fetch flag scan.** A private `scanFlag` switch in `src/web/fetch/command.ts` covers `--format`, `--timeout`, `--max-chars`, `--offset`, and `--provider`, each through its own small `scan…` function returning 2 or `undefined`, like `scanResults` through `scanProvider` at `src/web/search/command.ts:48`–`76`. Every flag takes exactly one value. A repeat is detected by the field already being `!== undefined`, never by truthiness, so `--offset 0 --offset 5` is refused.
- **URL check.** An exported `isWebFetchUrl(value: string)` is true only when `URL.canParse(value)` is true and `new URL(value).protocol` is `http:` or `https:`. So `ftp://x`, `file:///etc`, `example.com`, and `https://` are refused, and `HTTPS://Example.com/A` is accepted and kept as typed. Subplan 18's remote boundary applies the same rule and can import this predicate rather than restating it. No `try`/`catch` is needed, because `new URL` runs only after `URL.canParse` passed.
- **Format check.** An exported type guard `isWebFetchFormat(value: unknown): value is WebFetchFormat` is true only for the strings `markdown`, `text`, and `html`. `--format` lowercases its value with `toLowerCase()` and then applies the guard, so `TEXT` becomes `text` and `pdf` is refused. Implement the guard as `typeof value === 'string'` plus membership in a module-private `ReadonlySet<string>` of the three formats. Three chained `===` comparisons trip `unicorn/prefer-includes-over-repeated-comparisons` (its default minimum is 3), and `.includes` on a `readonly WebFetchFormat[]` won't accept a plain `string` without a cast. Subplan 18 checks the remote `format` field with the same guard.
- **Numbers.** `--timeout` and `--max-chars` reuse `positiveInteger` from `src/positive-integer.ts:1` plus a range check against the constants above, as `scanResults` and `scanChars` do (`src/web/search/command.ts:48` and `:56`). One private helper in the fetch module returns `positiveInteger(value)` when it falls in `[min, max]` and `undefined` otherwise, and both scanners use it. `positiveInteger` accepts only `/^\d+$/` words that are safe integers of at least 1. So `--offset` accepts the literal word `0` as 0 and otherwise takes `positiveInteger`'s value. These follow from that:
  - `00` is refused for `--offset`, because `positiveInteger` turns it into 0 and rejects it;
  - a leading zero on a non-zero value is accepted, so `--timeout 007` is 7, as `--results 05` is 5 in `web search`;
  - `-1`, `+5`, `1.5`, and `1e3` are refused for every numeric flag;
  - an `--offset` above `Number.MAX_SAFE_INTEGER` (for example `9007199254740992`) is refused, matching subplan 18's safe-integer check at the remote boundary.
  No new number helper is added outside the fetch module.
- **Provider.** `--provider` takes any value that `flagValue` accepts, kept as typed, as `scanProvider` (`src/web/search/command.ts:71`) does. Unknown names are resolution's refusal (subplan 5), not the parser's.
- **Malformed forms (source plan).** Each of these returns `{ error: WEB_FETCH_USAGE }` and nothing else:
  - bare `web fetch`;
  - a missing URL, or a third word starting with `--`;
  - a refused URL;
  - an unknown flag, which includes `--prompt`, `--mode`, and a flag in the wrong case;
  - a repeated flag;
  - a flag with no value, or whose value starts with `--`;
  - a `--timeout` or `--max-chars` outside its range or not a whole number;
  - an `--offset` that is not a whole number ≥ 0 within the safe-integer range;
  - a `--format` other than `markdown`, `text`, or `html`, matched case-insensitively;
  - any extra word, including a second URL.
- **One URL per call (source plan).** One parse yields one URL. A second URL is an extra word.
- **File size.** `src/web/fetch/command.ts` lands around 120 counted lines. Subplan 23 adds `WEB_FETCH_PRIMER` and `isWebFetchReplyLine` to this file, about 15 more, so it stays under the 200-line `max-lines` limit without a split. `src/web/search/command.ts` shrinks.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Search parser | `parseWebSearch` (`:111`), `scanFlag` (`:78`), `scanResults` through `scanProvider` (`:48`–`:76`) in `src/web/search/command.ts` | The shape to copy for the fetch scanners and `parseWebFetch` |
| Flag-scan pieces | `flagValue` (`:43`) and `scanArguments` (`:98`) in `src/web/search/command.ts` | Moved into `src/web/flag-scan.ts` and shared by both parsers |
| Search constants | `WEB_SEARCH_MIN_CHARS` … `WEB_SEARCH_DEFAULT_PROVIDER` (`:13`–`:27`) in `src/web/search/command.ts` | Naming pattern for the fetch constants |
| Whole-number check | `positiveInteger` in `src/positive-integer.ts` | `--timeout`, `--max-chars`, and a non-zero `--offset` |
| Fetch format type | `WebFetchFormat` in `src/web/providers/contract.ts` (subplan 2) | `format` field type and the guard's target |
| URL checks | `URL.canParse`, `new URL(...).protocol` (Node 24 global, typed by `@types/node`) | `isWebFetchUrl` |
| Search parser tests | `src/web/search/command.test.ts` (`describe('exported defaults')`, `describe('parseWebSearch')`) | Pattern for the fetch tests, and the regression net for the flag-scan move |

## Proposed changes

Land both items as one change. Each keeps typecheck and tests green on its own, so the order inside it doesn't matter.

- `src/web/flag-scan.ts` (new): `flagValue` and `scanFlagArguments`, moved from `src/web/search/command.ts`.
- `src/web/search/command.ts`: delete the private `flagValue` and `scanArguments`, import `flagValue` and `scanFlagArguments` from `../flag-scan.js`, and have `parseWebSearch` call `scanFlagArguments` with a fresh `ScannedArgs` and its `scanFlag` where it called `scanArguments`. Nothing else in the file changes.
- `src/web/fetch/command.ts` (new): `WebFetchCommand`, the constants, `WEB_FETCH_USAGE`, `isWebFetchUrl`, `isWebFetchFormat`, the private scanners and `scanFlag`, and `parseWebFetch`. It imports `positiveInteger` from `../../positive-integer.js`, `flagValue` and `scanFlagArguments` from `../flag-scan.js`, and `import type { WebFetchFormat }` from `../providers/contract.js` (`@typescript-eslint/consistent-type-imports`). The agent primer and reply-line predicate join this module in subplan 23.

## Tests

`src/web/fetch/command.test.ts` (new), laid out like `src/web/search/command.test.ts`:

- **Exported defaults:** the default and range constants pin `markdown`, 30, 10000, 0, `auto`, and the ranges 1–120, 200–100000, and minimum offset 0. `WEB_FETCH_USAGE` equals the source plan's line verbatim.
- **Accepted forms:**
  - `web fetch https://example.com` fills every default;
  - each flag alone sets only its field;
  - all five flags in a non-default order;
  - `--format TEXT` becomes `text`, and `--provider TaVily` stays `TaVily`;
  - range edges: `--timeout 1` and `120`, `--max-chars 200` and `100000`, `--offset 0` and `123456`;
  - `--timeout 007` is 7;
  - `WEB FETCH https://x` and extra whitespace around and between words;
  - `HTTPS://Example.com/A` and `http://localhost:3000/x` accepted, the URL kept as typed.
- **Malformed forms, each returning the usage line, one case each:**
  - bare `web fetch`;
  - `web search https://x`;
  - a flag before the URL;
  - an `ftp:` URL, a `file:` URL, a bare host, and `https://` with no host;
  - an unknown flag, `--prompt x`, `--mode fast`, `--FORMAT text`, and `--format=text`;
  - a repeated `--format`, and `--offset 0 --offset 5`;
  - `--timeout` with no value, and `--provider --format`;
  - `--timeout 0`, `121`, and `1.5`;
  - `--max-chars 199` and `100001`;
  - `--offset -1`, `00`, and `9007199254740992`;
  - `--format pdf`;
  - an extra word, and two URLs.
- **Guards:** `isWebFetchFormat` is true for each of the three formats and false for `Markdown`, `pdf`, and a non-string; `isWebFetchUrl` is true for an `http:` and an `https:` URL and false for `ftp://x` and `example.com`.

`src/web/search/command.test.ts` passes unchanged. It covers the moved `flagValue` and scan loop: missing values, values starting with `--`, repeats, and unknown flags.

## Out of scope

- Rendering (subplan 14), the core (subplan 15), and the cache (subplan 16).
- The remote operation's own field checks (subplan 18), which may import the guards and constants from here.
- The `web` entry point, bare-`web` usage, and the subcommand split (subplan 20).
- Wiring `parseWebFetch` into the typed command (subplan 21) and the far-side loop (subplan 25).
- Completion of the fetch flags and values (subplan 22).
- The agent primer and reply-line predicate (subplan 23).
- Any spec or help change. The command isn't reachable yet, and subplan 21 writes `product/specs/web-fetch.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `npm run test:server -- src/web/fetch src/web/search` so both parser suites run even if `--changed` skips one.

There's no user-visible fetch behavior yet. Because the search parser now uses the shared scan, check in a shell tab that `web search vitest --results 3` still searches, and that `web search vitest --results`, `web search vitest --results 3 --results 4`, and `web search vitest --bogus x` each still print the `web search` usage line.
