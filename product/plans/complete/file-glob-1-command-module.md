# File glob 1 — pure `file glob` command module

**Complexity: 5/10** — ~80 added lines in one new file, 0 files edited, 15 requirements, 18 test scenarios (p=5.63)

Run order: 1 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on nothing.

This subplan adds the pure half of `file glob`: the argument type, the parser and its usage line, the primer text, the command-line predicate, and the result formatter. Nothing calls it yet. Every later subplan imports from it, so it lands first and keeps typecheck green on its own.

## Design decisions

All from the source plan:

- The code lives in a new `src/file-glob/` feature directory. This module is `src/file-glob/command.ts` and does no I/O (architecture principle 4: parse pure, execute effectful).
- Syntax is `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`, in the flag style of `file read`. The pattern is one whitespace-free token. Flags may appear in any order, before or after the pattern, and each may appear once.
- `--limit` defaults to 100 and accepts 1 through 1000. Zero, a value above 1000, a non-integer, or a repeated flag prints the usage line, the same way `parseFileRead` treats `--limit` above its maximum.
- An unknown flag, a flag missing its value, a missing pattern, or a second pattern is a usage error.
- The usage line is exactly `Usage: file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`, in the form of `FILE_READ_USAGE`.
- The primer is exactly these four lines, joined by newlines:
  - `To find files in the workspace by path, end your reply with one line:`
  - `file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`
  - `Patterns are case-sensitive and relative to --path (default: the workspace root): ** spans folders, * stays within one name, ? is one character, {a,b} is either. Results are workspace-relative paths, at most 100 by default; hidden and git-ignored paths are skipped unless --hidden is given, and --dirs lists folders instead of files.`
  - `Example: file glob **/*.test.ts --path src`
- Output is one path per line. An empty result is `(no matches)`. A truncated result ends with `(showing the first <n> matches; narrow the pattern or raise --limit)`. A timed-out result ends with `(search stopped after 30 seconds; narrow the pattern or --path)`. When the limit ends the search only the truncation line is printed, so the formatter prints the truncation line and not the timeout line when both flags are set.
- No total match count is ever computed or printed.

Decisions this subplan makes for edge cases the source plan leaves open, each matching `parseFileRead`'s existing behavior:

- Any token starting with `--` is a flag, so a pattern that starts with `--` is a usage error (as `file read --notes.md` is). A token starting with a single `-` is an ordinary pattern. `--limit=5` is an unknown flag.
- A `--path` value that starts with `--` (`file glob x --path --hidden`) is a usage error for a missing value, the way `--limit --offset 5` is for `file read`. Any other `--path` token is passed through verbatim; this module never checks it for `..`, absolute paths, or existence (subplan 4 does).
- `--limit` accepts only an all-digit token that is a safe integer, so `--limit 007` is 7, and `--limit -3`, `--limit 1.5`, `--limit 1e3` are usage errors.
- The command words match case-insensitively; the pattern and `--path` value keep their case. Surrounding and repeated whitespace, including tabs, is tolerated.
- The pattern is not checked for glob syntax here (an unbalanced `{` is passed through); matching is subplan 2's job.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `parseFileRead`, `scanArguments`, `positiveInteger`, `FILE_READ_USAGE`, `FILE_READ_PRIMER`, `isFileReadCommandLine` | `src/file-read/command.ts` | The model for the parser shape, the `{ error }` return, the flag scan, the primer constant, and the predicate's regular expression. `scanArguments` and `positiveInteger` are not exported; see the decision below. |
| `src/file-read/command.test.ts` | | The model for the test file: a shared `usage` constant, one `describe` per export, and the primer asserted with `toBe` against the joined lines. |

## Proposed changes

Create `src/file-glob/command.ts` (about 75 lint-counted lines, well under the 200-line limit). It imports nothing from other modules. Do not edit or import from `src/file-read/command.ts`: its `positiveInteger` helper is private, so write a private equivalent in this module (four lines, below the `.jscpd.json` clone threshold of 5 lines and 50 tokens). This keeps the subplan to one new source file and one new test file. The module contains:

- `FileGlobArgs`: `pattern` (string), `dir` (the `--path` value, or `undefined` for the root), `hidden` (boolean), `dirs` (boolean), and `limit` (number).
- `FILE_GLOB_DEFAULT_LIMIT` (100) and `FILE_GLOB_MAX_LIMIT` (1000). The remote operation in subplan 5 validates against the maximum.
- `FILE_GLOB_USAGE`, the usage line above.
- `parseFileGlob(input)`, returning `FileGlobArgs` or `{ error: FILE_GLOB_USAGE }`. It trims, splits on whitespace, and requires the first two words to be `file` and `glob` (case-insensitive, as `parseFileRead` does). It scans the rest: `--path` takes the next token, `--limit` takes the next token as a positive whole number, `--hidden` and `--dirs` take nothing, and any other token starting with `--` is an error. A flag seen twice, a value-taking flag at the end of the line, or a second non-flag token is an error. A missing pattern is an error. A limit above `FILE_GLOB_MAX_LIMIT` is an error. Omitted values are filled with `??` (`limit` with `FILE_GLOB_DEFAULT_LIMIT`, `hidden` and `dirs` with `false`), per `@typescript-eslint/prefer-nullish-coalescing`. The returned object always has all five keys, with `dir: undefined` when `--path` is absent, so `toEqual` assertions are exact. Structure: a private scan function loops over the tokens and hands each `--` token to a private per-flag helper that records the flag on a partial `FileGlobArgs` and reports how many tokens it consumed (1 or 2) or a failure; the loop itself only handles the pattern token. This split keeps each function under the `sonarjs/cognitive-complexity` limit of 15 with four flags instead of `file read`'s two.
- `FILE_GLOB_PRIMER`, the four primer lines joined by `\n`.
- `isFileGlobCommandLine(line)`, matching `^file\s+glob(\s|$)` case-insensitively, mirroring `isFileReadCommandLine`.
- `formatGlobResult(paths, { limit, truncated, timedOut })`: the paths joined one per line, or `(no matches)` when the list is empty; then the truncation line naming `limit` when `truncated`, else the timeout line when `timedOut`. Lines are joined with `\n` and there is no trailing newline. The paths are printed verbatim: the walker (subplan 3) already makes them root-relative and adds the trailing `/` in `--dirs` mode, and it already cuts the list to `limit`, so the formatter neither slices, sorts, nor rewrites paths. `limit` is used only in the truncation line. The `30 seconds` in the timeout line is literal text in this module; `GLOB_TIMEOUT_MS` belongs to subplan 4 and is not imported here. Export the options object's type as `GlobResultFlags` so subplan 4 can name it.

## Tests

`src/file-glob/command.test.ts` (server vitest project, picked up by its `src/**/*.test.{ts,tsx}` include), modelled on `src/file-read/command.test.ts`:

- The pattern alone gives the defaults: `dir` undefined, `hidden` and `dirs` false, `limit` 100.
- Every flag parsed, in several orders, before and after the pattern; mixed-case `FILE GLOB` accepted with the pattern's case kept; surrounding whitespace and tabs tolerated.
- The usage line for: `file`, `file glob` with no pattern, `file read x`, two patterns, an unknown flag (`--limit=5`, `--hiden`), a pattern starting with `--`, each flag repeated, `--path` with no value, `--path --hidden`, `--limit` with no value, `--limit 0`, `--limit 1001`, `--limit x`, `--limit 1.5`, `--limit -3`; `--limit 1000`, `--limit 1`, and `--limit 007` (as 7) accepted.
- `isFileGlobCommandLine`: true for `file glob`, `file glob *.ts`, `FILE  GLOB x`; false for `file`, `file globs`, `file glob-x`, `file read x`, and `files glob`.
- `formatGlobResult`: an empty list gives `(no matches)`; a list prints one path per line; truncated appends the truncation line with the limit; timed out appends the timeout line, including after `(no matches)`; truncated and timed out together print only the truncation line.
- `FILE_GLOB_PRIMER` equals the four lines verbatim.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes: lint (including `max-lines` and cognitive complexity), typecheck, and the new test file.
- No manual end-to-end check is possible yet, because nothing calls this module; the typed and ACP end-to-end checks are in subplan 9.

## Out of scope

Any filesystem access, `--path` validation, glob matching, the walker, remote transport, command routing, ACP wiring, completion, help, and specs. Those are subplans 2 to 9. Patterns containing whitespace stay unsupported. No edit to `src/file-read/`.
