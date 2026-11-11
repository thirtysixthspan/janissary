# Complete the file help page's usage-line inputs

**Complexity: 1/10** — no production code lines or files, 2 requirements, 2 test scenarios (p=2.76)

## Goal

Make the `file` command help page list every input that prints the usage line, so a user who types a second path argument, a path containing spaces, or a path starting with `--` learns why the command refused it.

## Approach

The parser in `src/file-read/command.ts` splits the input on whitespace. `scanArguments` returns undefined for any token starting with `--` other than `--offset` and `--limit`, and for a second non-flag token once a path is set. So a path with spaces becomes two path tokens and prints usage, and a path that begins with `--` is read as an unknown flag. The help page's usage paragraph omits both cases. Extend that paragraph in `help/file.md` and add one sentence saying the path is a single token without whitespace. The parser does not change. Pin the two cases the page now names with parser tests so the page and the parser cannot drift silently.

## Implementation steps

1. In `help/file.md`, extend the paragraph that begins "Bare `file`, `file read` without a path, …" so it also names a second path argument and a path that starts with `--`, and add a sentence saying the path is one token with no whitespace, so a path containing spaces cannot be read with this command.
2. In `src/file-read/command.test.ts`, add tests that a path containing a space and a path starting with `--` both return the usage line.

## Tests

- `parseFileRead('file read my notes.md')` returns the usage error.
- `parseFileRead('file read --notes.md')` returns the usage error.
- Existing `src/file-read/command.test.ts` and `src/commands.test.ts` (help page and row pairing) keep passing.

## Specs and docs

- `help/file.md` usage paragraph, as above. The `help/commands.md` row stays unchanged.
- No spec change: the typed `file` command has no functional spec yet; its spec is written by subplan 26 of the ACP tool loop series.

## Out of scope

- Changing the parser, including adding quoting or escaping for paths with whitespace.
- The help page's error conditions and tab completion for the `file` command (separate backlog entries).
