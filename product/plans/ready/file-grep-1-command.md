# Parse flags-first file grep commands
**Complexity: 6/10** — ~110 added production lines, 12 behavioral requirements and 60 scenarios, including flag-table variants (p=5.96829).

## Dependencies

Depends on: none (file glob has already landed). Source: `product/plans/complete/file-grep.md`, the unchanged canonical feature document archived by the decomposition.

## Goal and decisions

Add the pure `src/file-grep/command.ts` command contract. The canonical feature's “Syntax” and “Dash-led patterns” decisions are at `product/plans/complete/file-grep.md:14`; file glob already exists in `src/file-glob/`. This parser deliberately differs from glob: flags occur only before the pattern.

This plan lands an independently testable module, without exposing the command. Plans 5, 8, 10 and 12 consume `FileGrepArgs`; plan 8 and plan 12 consume `parseFileGrep`; plans 12, 13 and 15 consume the predicate; plan 15 composes the primer; plan 16 mirrors the grammar for completion. All consumers import directly from this defining module.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Parser result convention | `src/file-read/command.ts:34`, `parseFileRead` | Follow the args-or-error return shape; do not call this read-specific parser. |
| Command recognition | `src/file-read/command.ts:50`, `isFileReadCommandLine` | Copy its anchored, case-insensitive whole-subcommand boundary convention. |
| Positive integer validation | `src/positive-integer.ts:1`, `positiveInteger` | Import for limit validation, retaining digit-only safe-integer semantics and accepted leading zeros. |
| Result ceiling | `src/search/types.ts:4`, `SEARCH_MAX_RESULTS` | Import the existing 250 cap instead of defining another maximum. |
| Parser and primer tests | `src/file-read/command.test.ts:1`, `parseFileRead` tests | Use colocated Vitest tests and exact args/error/primer comparisons. |

Do not reuse the whitespace-splitting parser at `src/file-glob/command.ts:78`, `parseFileGlob`, because grep preserves pattern spacing. Existing consumers at `src/commands/file.ts:10`, `fileOutput`, and `src/acp/tool-table.ts:80`, `filePrimer`, illustrate later wiring; neither changes in this plan.

## Proposed changes

- Export `FileGrepArgs`. Its required properties are `pattern`, `include` and `exclude` strings; `literal`, `word` and `caseSensitive` booleans; `limit` number; and `path` string or undefined. The `path` property is present even when omitted by the user. Default the three booleans to false, include/exclude to empty strings, path to undefined, and limit to exported `FILE_GREP_DEFAULT_LIMIT` 100.
- Export `parseFileGrep(input)`, taking a string and returning `FileGrepArgs` or an object whose sole property is `error`, containing `FILE_GREP_USAGE`. Require separate case-insensitive `file` and `grep` keywords; empty, incomplete or other commands return usage. Trim surrounding input whitespace and recognize whitespace-separated front tokens by their offsets. Preserve the exact pattern remainder from its first non-whitespace character, including internal spaces and tabs, without rebuilding it from split tokens.
- Recognize three switches `--literal`, `--word`, `--case-sensitive` and four single-token valued flags `--path`, `--include`, `--exclude`, `--limit`. Flags use the lowercase spelling exactly, accept any order before the pattern, and each may appear once. A valued flag consumes exactly one following token. A missing token or any token starting with `--`, including the terminator, is a missing-value usage error. Single-dash values remain values; numeric validation still rejects a negative limit. Do not support equals syntax such as `--limit=2`.
- Validate limit with `positiveInteger`, then reject values above `SEARCH_MAX_RESULTS`: digits only, safe integer, 1–250 inclusive, with `007` accepted as 7. Zero, negatives, fractions, exponent notation and nonnumeric values return usage.
- A standalone `--` ends flag parsing. Skip its following separator whitespace, then preserve the remainder as pattern; a terminator without a pattern returns usage. Without the terminator, an unknown double-dash token before pattern returns usage and a single-dash token starts pattern. After the first pattern token every token, including repeated or unknown flags and another `--`, is literal pattern text. Thus `file grep x --path missing` has undefined path and pattern `x --path missing`.
- Preserve pattern and string flag values verbatim. Do not remove quotes, unescape backslashes, expand globs, normalize paths, compile regexes or check existence here. For example `[unclosed` is valid parser output for the workspace entry to reject later; quotes remain pattern characters. This keeps parsing pure and lets remote and local consumers share the same data contract.
- Export `FILE_GREP_USAGE` with the exact observable text `Usage: file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`. Every malformed invocation above returns this same error object without throwing or adding diagnostics.
- Export `isFileGrepCommandLine(line)`, taking a string and returning a boolean. Match `^file\s+grep(\s|$)` case-insensitively, with no trimming or slash removal inside the predicate. Recognize bare and malformed grep commands so later routing and authorization can handle them; reject `file greps`, `file grep-x`, leading whitespace and `/file grep`. Parser trimming and caller normalization are separate from this predicate's contract, as they are for read.
- Export `FILE_GREP_PRIMER` as exactly the following four observable lines joined by single newlines, with no trailing newline. The example contains one literal backslash. Primer composition and blank lines between command primers belong to plan 15:
  - `To find text inside workspace files, end your reply with one line:`
  - `file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`
  - `Flags come first; the rest of the line is the pattern, a case-insensitive regular expression unless --literal or --case-sensitive. Results are path:line: text, at most 100 by default; --include and --exclude take comma-separated globs such as *.ts,*.tsx.`
  - `Example: file grep --include *.ts function\s+parse`

## Tests

Add `src/file-grep/command.test.ts`, importing from `./command.js`, with the following coverage:

- Defaults, including the present undefined path property; each of the seven flags individually; mixed flag orders; exact internal spaces/tabs; surrounding and inter-keyword whitespace; case-insensitive keywords with preserved values; uppercase flags refused; no quote or backslash decoding; path/include/exclude spellings retained; malformed regex passed through.
- Terminator with a double-dash pattern and repeated separator whitespace; terminator without a pattern; single-dash pattern; flags after the first pattern token retained literally; empty/incomplete/wrong commands; missing pattern after valid flags; unknown prefix flag and equals syntax; every flag repeated before pattern; every valued flag missing its value or followed by a double-dash token.
- Limits 1, 250 and leading zeros; zero, 251, negative, fractional, exponent, nonnumeric and unsafe-integer values. Table-driven cases should preserve the same usage-only error shape.
- Predicate accepts bare, valid and malformed grep invocations and case/whitespace between keywords; rejects wrong command boundaries, leading whitespace and slash prefixes. Assert the exact usage and four-line primer text, including its single backslash and lack of a trailing newline.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Manually call `parseFileGrep` with `file grep --path src FILE_READ_USAGE`: expect path `src` and pattern `FILE_READ_USAGE`. Compare `file grep x --path missing`: expect undefined path and pattern `x --path missing`. Check `file grep -- --limit` yields pattern `--limit`. Application end-to-end execution becomes available in plan 12; this foundation plan does not register a command. The canonical source's flags-after-pattern examples are stale and must not change this grammar.

## Out of scope

No disk reads, matching, regex validation, command registration, ACP authorization or primer composition, completion changes, shell quote processing, flags after pattern, or changes to file glob. Public help/spec integration remains assigned to the later behavior-exposing plans and plan 17.

## Implementation constraints

Use direct .js imports in src, pure parsing separate from I/O, existing authoritative server state and registries, and focused modules below 200 lint-counted lines. Extract cohesive logic rather than compacting code. During implementation update the matching behavior spec in the same change when a public behavior becomes available. No npm run check; use the diff-scoped development gate.
