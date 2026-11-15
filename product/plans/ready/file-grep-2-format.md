# Format grep rows and bounded previews
**Complexity: 6/10** — ~65 added production lines, 15 behavioral requirements and 30 formatting/preview scenarios (p=5.74405).

## Dependencies

Depends on: none (file glob has already landed). Source: `product/plans/complete/file-grep.md`, the unchanged canonical feature document archived by the decomposition.

## Goal and decisions

Add pure formatting in the new `src/file-grep/format.ts`. The canonical feature's “Output”, “CRLF files” and “Preview” decisions are at `product/plans/complete/file-grep.md:20`. This independently testable module does not expose the application command. Plan 5 consumes its exported ending type; plan 8 consumes its formatter. Both import directly from the defining module.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Row contract | `src/search/types.ts:7`, `SearchMatch`, aliasing `src/protocol.ts:38` | Import the existing type; do not introduce another row shape or alter the wire contract. |
| First-match rows | `src/search/search-files.ts:26`, `matchFile` | Consume its path, one-based line number, untrimmed `match`, and first-match `start`/`end`; ignore `above` and `below`. |
| Span convention | `src/search/compile-matcher.ts:5`, `MatchSpan` | Preserve inclusive-start, exclusive-end UTF-16 offsets into the original line. |
| CRLF behavior | `src/search/search-files.ts:11`, `splitLines` | Matching retains carriage returns; remove one trailing carriage return only in the preview. |
| Result presentation | `src/file-glob/command.ts:113`, `formatGlobResult` | Follow its no-match sentinel and newline joining. Its combined flags are not grep's ending contract. |
| Formatter test style | `src/file-glob/command.test.ts:136`, `formatGlobResult` tests | Use colocated Vitest tests with exact string comparisons, including trailers after empty rows. |

There are no existing grep formatter callers or `src/file-grep/` modules to migrate. The later scan and workspace-entry plans provide the rows and ending; formatting does not call the matcher, normalize paths, or choose which stopping condition won.

## Proposed changes

- Export `previewLine(line, start, end)`. It takes the original matched-line string and its numeric first-match offsets and returns a preview string. Inputs use the existing `SearchMatch` contract. Remove exactly one final carriage return first, then trim leading whitespace using JavaScript's `trimStart` semantics. Keep remaining trailing and internal whitespace. Subtract the removed leading prefix length from both offsets and clamp each into the trimmed string's bounds. A span entirely inside removed whitespace collapses to its nearest edge; an all-whitespace line returns an empty preview. This changes presentation only, never matching or source rows.
- Measure offsets, the removed prefix and the 200-character bound in UTF-16 code units, matching `MatchSpan` and JavaScript string slicing. Do not convert offsets to code points or graphemes. Show trimmed lines of at most 200 units whole, including an exactly 200-unit line.
- Otherwise take a 200-unit content window containing the shifted/clamped first match. For a match of at most 200 units, center the full span with equal spare content on each side where possible; place an odd spare unit after the match. Shift that window within the line's bounds so it remains 200 units long at either edge. A match longer than 200 starts the window at the match and shows its first 200 units. Add one `…` at each end where trimmed content was cut. Ellipses sit outside the 200-unit content window; trimming whitespace or removing the carriage return alone does not add an ellipsis. Add no highlighting or match markers.
- Export `GrepEnding` from `format.ts` as a discriminated union of three object variants. The discriminant is `kind`: `limit` carries a numeric `limit`; `timeout` carries no payload beyond its discriminant; `slow` carries a string `path`, already root-relative with forward slashes. Undefined is separate from this type and means normal completion. Do not use combined flags or add an undefined variant to `GrepEnding`. Plan 5 imports this exact type from `./format.js` for its returned ending rather than declaring another union.
- Export `formatGrepResult(rows, ending)`. It takes a readonly array of `SearchMatch` rows plus an optional `GrepEnding` and returns one string, with no I/O or mutation. Preserve supplied row order and path spelling; callers already supply root-relative forward-slash paths and one-based line numbers. Print path, colon, line number, colon-space, then `previewLine` applied to `match`, `start` and `end`. Ignore above/below context, and do not sort, renumber or deduplicate rows. Join output lines with one newline and add no trailing newline.
- Empty rows print `(no matches)`, including when an ending follows. An absent or explicitly undefined ending adds nothing. A present ending appends exactly one trailer on the next line. The caller supplies only visible limit rows, so this formatter does not truncate or detect limits itself.
- The limit trailer is exactly `(showing the first <n> matches; narrow the pattern or raise --limit)`, where `<n>` is the ending's `limit`, not a computed total or the array length. The timeout trailer is exactly `(search stopped after 30 seconds; narrow the pattern or --path)`. The slow trailer is exactly `(search stopped: the pattern took too long on <path>; simplify it or use --literal)`, interpolating the ending's path unchanged.

## Tests

Add `src/file-grep/format.test.ts`, importing the functions and ending type directly from `./format.js`. Cover these scenarios with exact strings and observable window lengths:

- Row syntax with a nested root-relative path and a one-based line number; supplied order across paths/lines; ignored context; no mutation of supplied rows; no rows without an ending; both omitted and explicitly undefined ending with rows; each of the three endings with nonempty and empty rows. Assert one separating newline and no final newline, and use a limit differing from the fixture row count to catch recomputing it.
- A short line with internal/trailing whitespace retained; exactly 200 units; 201 units; early, middle and late match windows with the appropriate one or two ellipses; odd spare space around a match; a match exactly 200 units long; a match longer than 200 units; and several matches on one line where the supplied first span determines the window.
- Leading spaces/tabs shifting the span; a span partly clipped by removed leading whitespace; a span wholly within that prefix; an all-whitespace line; one trailing carriage return with the span clipped at the new end; two final carriage returns proving only one is removed; and a non-BMP character before the match proving offsets and the cap remain UTF-16 units.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually format fixture rows for `src/file-read/command.ts` at a known line, with leading whitespace and a long preview, and inspect `src/file-read/command.ts:<line>: <preview>` with no match markers. Reuse its path and line as `file read src/file-read/command.ts --offset <line> --limit 1` to confirm the location is usable. Inspect an empty result with a timeout to confirm the sentinel and trailer are two lines. Full `file grep` application execution becomes available in plan 12; this module adds no command route.

## Out of scope

No matching, sorting, context lines, total counts, highlighting, path resolution, command registration, or changing CRLF matching semantics. Public help/spec integration remains assigned to the later behavior-exposing plans and plan 17.

## Implementation constraints

Use direct .js imports in src, pure parsing separate from I/O, existing authoritative server state and registries, and focused modules below 200 lint-counted lines. Extract cohesive logic rather than compacting code. During implementation update the matching behavior spec in the same change when a public behavior becomes available. No npm run check; use the diff-scoped development gate.
