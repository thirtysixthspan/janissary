# Web fetch 14 — rendering a fetched page

**Complexity: 5/10** — 16 requirements, 17 test scenarios, ~70 added lines in one new module and no edited file (p=5.61)

Run order: 14 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (sections "Output", "Empty content and offsets past the end", "Character slicing", the redirected-to line under "Redirects", "No summarization", and the "Rendering" bullet under "Fetch core"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` (the `src/web/` layout, which puts the search rendering precedent at `src/web/search/render.ts`). Placed after `product/plans/ready/web-fetch-13-fetch-parser.md` so `src/web/fetch/` already exists. It imports nothing from any earlier subplan.

A fetch returns one text string to the caller. That string carries a source line naming the final URL and provider, then a slice of the content, and, when more remains, a note saying where to continue. The whole string has to fit the `--max-chars` budget. This plan adds that rendering as pure functions, along with the two non-slice answers and the redirected-to line. Nothing outside tests calls them until the fetch core (subplan 15) arrives. That core and the cache (subplan 16) are the only callers.

Paths below are the post-rename ones from subplan 1. `src/web/search/render.ts` is today's `src/web-search/render.ts`, and its line anchors are unchanged by the move.

## Design decisions

- **Module and signatures.** A new `src/web/fetch/render.ts` exports three things and imports nothing:
  - the type `FetchedPage`, with three string fields: `url` (the final URL), `source` (the provider id), and `content` (the full page);
  - `renderFetched(page: FetchedPage, offset: number, maxChars: number): string`;
  - `renderRedirect(url: string): string`.
  Subplan 15 builds the page from the runner's `fetched` outcome (its flat `url` and `content`, per `product/plans/ready/web-fetch-6-fetch-attempt-runner.md`) plus the manifest id as `source`. Subplan 16 renders a cache hit through the same call. Both functions are pure: no I/O, no clock, no state.
- **No range checks here.** `renderFetched` trusts its numbers. The parser (subplan 13) and the remote boundary (subplan 18) already hold `offset` to a whole number ≥ 0 and `maxChars` to 200–100000. So tests may pass a budget below 200 to keep fixtures short.
- **Which answer prints.** `renderFetched` checks these in order and prints the first that applies:
  1. Empty `content` prints the empty-page answer at any `offset`, so `--offset 3` on an empty page still prints `(empty page)`.
  2. An `offset` at or past `content.length` prints the past-the-end answer.
  3. Otherwise it prints a slice.
- **Output layout (source plan, Output).** Every `renderFetched` answer joins its parts with `\n`:
  1. a source line, `Fetched <url> (<source>).`;
  2. an empty line;
  3. the body, which is the slice, `(empty page)`, or `(offset <o> is past the end; the page has <n> characters)`;
  4. for a slice with content remaining past it, the note `(showing characters <a>-<b> of <n>; continue with --offset <b>)`.
  So the header in front of the body is the source line plus two newline characters. In the note, `<a>` is the requested offset, `<b>` is the slice's exclusive end, and `<n>` is `content.length`. In the past-the-end line, `<o>` is the requested offset and `<n>` is `content.length`. Every number is written with `String(…)` as plain digits with no grouping, as `truncationNote` does at `src/web/search/render.ts:80`.
- **Printed verbatim.** The URL, the source, and the slice print exactly as given. There's no percent-encoding or bracket escaping, unlike search's `encodeUrl` and `escapeTitle` (`src/web/search/render.ts:11` and `:22`), which exist because search prints Markdown links. There's no trimming, whitespace collapsing, or line-ending change either, unlike search's `collapse` (`:7`). The slice is exactly `content.slice(offset, end)`, so following the notes from offset 0 and joining the slices rebuilds the content exactly.
- **Budget (source plan, Output and Character slicing).** `maxChars` bounds the whole string: the header, the slice, and, when one prints, the note with its leading newline. Lengths are UTF-16 code units (`string.length`), as `web search`'s budget counts (`withNote(…).length <= maxChars` in `wholeResultCount`, `src/web/search/render.ts:88`). The slice end is found in these steps:
  1. When the header plus everything from `offset` to the end of the content fits in `maxChars`, the slice is the whole rest and no note prints.
  2. Otherwise a note is needed. Reserve its length with `<a>` as the offset, `<n>` as `content.length`, and `<b>` counted as having as many digits as `<n>`. Since `<b>` never exceeds `<n>`, the real note is never longer than the reservation. The room is `maxChars` minus the header, minus 1 for the note's newline, minus the reserved note. The end is `offset` plus the room.
  3. The surrogate and progress rules below adjust that end.
  4. The note prints exactly when the final end is short of `content.length`.
  When `<b>` turns out to have fewer digits than `<n>`, the output lands that many units under `maxChars`. That slack is accepted. Recomputing the end with `<b>`'s own digit count could change `<b>` again, and saving one or two characters isn't worth the loop.
- **Surrogate pairs and progress (source plan, Character slicing).** Three rules adjust the slice end from step 2, in this order:
  - At least one unit always prints, so `--offset` always advances. When the room is 0 or less, the end is `offset + 1`.
  - The end never splits a surrogate pair. When the unit before the end is a high surrogate and the unit at the end is a low one, the end moves back one unit. `content.codePointAt(end - 1)` is above `0xFFFF` in exactly that case, which is the whole check. Don't use `charCodeAt`: it trips `unicorn/prefer-code-point`, which `unicorn.configs['flat/recommended']` in `eslint.config.mjs` turns on. `src/editor/save-conflict.ts:17` reads code units with `codePointAt` the same way.
  - When moving back would leave the slice empty, the end moves forward one unit instead, keeping the whole pair.
  A lone high surrogate with no low one after it is not a pair, so the end doesn't move. Search's private `dropLoneHighSurrogate` (`src/web/search/render.ts:95`) is not reused or exported: it drops any trailing high surrogate without looking at the next unit, and it has no forward move.
- **The start is never adjusted.** The slice starts at exactly `offset`, so `<a>` always equals the requested offset. A typed offset that lands between the halves of a pair starts the slice with a lone low surrogate. Every `<b>` a note prints sits on a pair boundary, so a caller following the notes never starts mid-pair.
- **Overflow (source plan, Character slicing).** The header and the reserved note together can exceed the budget, for example with a very long URL. The output then still carries at least one unit, or one whole pair, and exceeds the budget by what that needs, as `web search` prints its first link line whole (`cutFirstResult`, `src/web/search/render.ts:105`). The note still prints whenever content remains, so the caller can continue.
- **Non-slice answers (source plan, Empty content and offsets past the end).** The empty-page and past-the-end answers print whole whatever `maxChars` is. They carry no slice to shorten. Both are answers, and subplan 15 treats them as successes, so `auto` never falls back from them.
- **Redirect line (source plan, Redirects).** `renderRedirect(url)` returns `Web fetch: redirected to <url>.` with the URL verbatim. It's an answer rather than a failure. The URL is the `redirectedTo` target that subplan 12's `local` provider reports.
- **No summarization (source plan).** Slicing is the only way content is shortened, and long pages are read in slices with `--offset`.
- **Lint and size.** Keep `renderFetched` a short dispatcher over small private helpers: one for the source line, one for the note, and one for the slice end. That keeps each under `sonarjs/cognitive-complexity`'s limit of 15. The module lands around 70 counted lines, well under the 200-line `max-lines` limit.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Search rendering | `renderResults` (`:114`), `withNote` (`:84`), `wholeResultCount` (`:88`), and `cutFirstResult` (`:105`) in `src/web/search/render.ts` | Precedent: the budget includes the note, it counts `string.length`, and the first item prints whole when nothing else fits |
| Search note | `truncationNote` in `src/web/search/render.ts:80` | Precedent for writing counts with `String(…)` |
| Code-unit reads | `codePointAt` in `src/editor/save-conflict.ts:17` | The lint-clean way to read a unit for the surrogate check |
| Search rendering tests | `src/web/search/render.test.ts` | Layout for the new test file |

## Proposed changes

- `src/web/fetch/render.ts` (new): `FetchedPage`, `renderFetched`, `renderRedirect`, and the private helpers.

## Tests

`src/web/fetch/render.test.ts` (new), laid out like `src/web/search/render.test.ts`. Each case asserts the exact output string unless it says otherwise:

- A short page printed whole: the source line, an empty line, and the content, with no note.
- A rest that fits `maxChars` exactly, printed whole with no note.
- A long page from offset 0: the note `(showing characters 0-<b> of <n>; continue with --offset <b>)` as the last line, with a total length of exactly `maxChars` when `<b>` and `<n>` have the same digit count.
- A slice from a non-zero offset, starting at that offset, with the note's `<a>` equal to it.
- The digit slack: when `<b>` has fewer digits than `<n>`, the total is `maxChars` minus the difference.
- The last slice, printed with no note.
- Following each note's `--offset` from 0 until no note prints, then joining the slices, rebuilds the content exactly. Run it once on ASCII text and once on a page of emoji.
- A slice that would split a surrogate pair, ending one unit earlier.
- A lone high surrogate before the end, with no low surrogate after it, left in place.
- A one-unit room on a high surrogate, keeping the whole pair.
- A very long URL, still printing one unit and the note, so the output exceeds `maxChars`.
- An offset inside a pair, starting the slice with the low surrogate and printing that offset as `<a>`.
- The URL and content printed verbatim: parentheses and spaces in the URL, and `\r\n` and leading and trailing whitespace in the content, all unchanged.
- `(empty page)` at offset 0, and again at offset 3.
- An offset equal to the length, and one greater than it, each printing the past-the-end line with that offset and the length.
- A non-slice answer printed whole when it's longer than `maxChars`.
- The redirect line.

## Out of scope

- Deciding when each answer applies, the fallback loop, and the failure and refusal lines (subplan 15).
- The cache (subplan 16).
- Checking the ranges of `offset` and `maxChars` (subplans 13 and 18).
- Any spec or help change. Nothing reaches this output yet, and subplan 21 writes `product/specs/web-fetch.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `npm run test:server -- src/web/fetch/render.test.ts` so the suite runs even if `--changed` skips it. No user-visible behavior changes.
