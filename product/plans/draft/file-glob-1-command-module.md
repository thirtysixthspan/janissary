# File glob 1 — pure `file glob` command module

**Complexity: 5/10** — ~80 added lines, 13 requirements, 16 test scenarios, 9 new units (p=5.49)

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

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `parseFileRead`, `scanArguments`, `positiveInteger`, `FILE_READ_USAGE`, `FILE_READ_PRIMER`, `isFileReadCommandLine` | `src/file-read/command.ts` | The model for the parser shape, the `{ error }` return, the flag scan, the primer constant, and the predicate's regular expression. |

## Proposed changes

Create `src/file-glob/command.ts` with:

- `FileGlobArgs`: `pattern` (string), `dir` (the `--path` value, or `undefined` for the root), `hidden` (boolean), `dirs` (boolean), and `limit` (number).
- `FILE_GLOB_DEFAULT_LIMIT` (100) and `FILE_GLOB_MAX_LIMIT` (1000). The remote operation in subplan 5 validates against the maximum.
- `FILE_GLOB_USAGE`, the usage line above.
- `parseFileGlob(input)`, returning `FileGlobArgs` or `{ error: FILE_GLOB_USAGE }`. It trims, splits on whitespace, and requires the first two words to be `file` and `glob` (case-insensitive, as `parseFileRead` does). It scans the rest: `--path` takes the next token, `--limit` takes the next token as a positive whole number, `--hidden` and `--dirs` take nothing, and any other token starting with `--` is an error. A flag seen twice, a value-taking flag at the end of the line, or a second non-flag token is an error. A missing pattern is an error. A limit above `FILE_GLOB_MAX_LIMIT` is an error. A local scan helper mirrors `scanArguments` so cognitive complexity stays under the lint limit.
- `FILE_GLOB_PRIMER`, the four primer lines joined by `\n`.
- `isFileGlobCommandLine(line)`, matching `^file\s+glob(\s|$)` case-insensitively, mirroring `isFileReadCommandLine`.
- `formatGlobResult(paths, { limit, truncated, timedOut })`: the paths joined one per line, or `(no matches)` when the list is empty; then the truncation line naming `limit` when `truncated`, else the timeout line when `timedOut`. The caller passes at most `limit` paths.

## Tests

`src/file-glob/command.test.ts`:

- The pattern alone gives the defaults: `dir` undefined, `hidden` and `dirs` false, `limit` 100.
- Every flag parsed, in several orders, before and after the pattern; mixed-case `FILE GLOB` accepted.
- The usage line for: a missing pattern, two patterns, an unknown flag, each flag repeated, `--path` with no value, `--limit` with no value, `--limit 0`, `--limit 1001`, `--limit x`, `--limit 1.5`; `--limit 1000` and `--limit 1` accepted.
- `isFileGlobCommandLine`: true for `file glob`, `file glob *.ts`, mixed case; false for `file globs`, `file read x`, and `files glob`.
- `formatGlobResult`: an empty list gives `(no matches)`; a list prints one path per line; truncated appends the truncation line with the limit; timed out appends the timeout line, including after `(no matches)`; truncated and timed out together print only the truncation line.
- `FILE_GLOB_PRIMER` equals the four lines verbatim.

## Verification

- `$janissary/scripts/run.mjs check-diff`.

## Out of scope

Any filesystem access, the walker, remote transport, command routing, ACP wiring, completion, help, and specs. Those are subplans 2 to 9. Patterns containing whitespace stay unsupported.
