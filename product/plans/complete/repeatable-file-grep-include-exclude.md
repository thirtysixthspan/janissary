# Allow repeated `--include` and `--exclude` flags in `file grep`

**Complexity: 3/10** — ~12 added lines in one production file, 6 requirements, 8 test scenarios (p=4.63)

## Goal

`file grep` currently refuses a command that names `--include` or `--exclude` more than once, even though each flag already accepts a comma-separated list of globs. Allow either flag to appear multiple times before the pattern and treat the occurrences as one combined list, so `file grep --include *.ts --include *.tsx needle` selects the same files as `file grep --include *.ts,*.tsx needle`.

## Root cause

`scanArguments` in `src/file-grep/command.ts` keeps a `seen` set of flag tokens and returns usage whenever a token repeats. That rule is applied uniformly to switches, `--path`, `--limit`, `--include`, and `--exclude`. The downstream filter already understands a comma-separated glob string: `filterPaths` in `src/search/filter-paths.ts` splits each field on commas, trims, and drops empty entries, so several `--include`/`--exclude` occurrences can be folded into the single string the rest of the pipeline expects.

## Approach

Keep the wire contract and every downstream module unchanged. Fold repeated include/exclude values into the existing `FileGrepArgs.include` and `.exclude` strings at parse time, joining occurrences with a comma. The comma is already this syntax's glob separator, so the union of the repeated values has exactly the same meaning as one comma-separated flag, and `filterPaths` needs no edit. Accumulate in the order the flags appear, and never introduce a leading or trailing comma: the first value replaces the empty default, later values append `,<value>`.

The `seen` check keeps refusing repeats of `--literal`, `--word`, `--case-sensitive`, `--path`, and `--limit`. Each repeated include/exclude occurrence still needs its own value token that does not start with `--`, so a missing or flag-looking value keeps printing the usage line. Pattern parsing, the `--` terminator, flags-first ordering, completion, remote transport, and the primer text are untouched.

## Implementation steps

1. In `src/file-grep/command.ts`, mark `--include` and `--exclude` as repeatable in the `seen` check, and append their values to the corresponding `FileGrepArgs` field with a comma separator while leaving `--path` and `--limit` as single-use.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

`src/file-grep/command.test.ts`:

- Two `--include` flags produce the two globs joined by a comma; two `--exclude` flags do the same.
- Three occurrences, and include and exclude repeated together on one line, keep every value in the order typed.
- A repeated include or exclude whose values already contain commas keeps the same comma-separated result.
- Repeating any of `--literal`, `--word`, `--case-sensitive`, `--path`, or `--limit` still prints the usage line.
- A repeated include or exclude with a flag-looking or missing value still prints the usage line.
- A single include or exclude, `--` before the pattern, and `isFileGrepCommandLine` keep their current behavior.

## Specs and docs

- `product/specs/acp.md`: in the File grep section, replace "each may appear once" with the rule that `--include` and `--exclude` may repeat and combine as if comma-separated, while other flags remain single-use.
- `help/file.md`: make the same correction in the File grep section, including the line that lists a repeated flag among malformed arguments.
- No user-documentation page describes the once-only limit, so none changes.

## Out of scope

- Changing `FileGrepArgs`, the remote `grep-files` operation, or the protocol version: repeated flags are folded into the same string the wire already carries.
- Changing glob semantics, `filterPaths`, the worker pipeline, or brace-list support.
- Allowing repeats of switches, `--path`, or `--limit`.
- Changing the primer, completion candidates, or the usage text.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests.
- Manual, local tab: `file grep --include *.ts --include *.tsx FILE_READ_USAGE` reports rows from both extensions; `file grep --include *.ts --include=bad needle` prints the usage line; `file grep --word --word needle` still prints the usage line.
