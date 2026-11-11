# ACP tool loop 1 — `file read` parser, primer slice, and line recognizer

**Complexity: 5/10** — ~58 added lines in one new module, 11 requirements, 30 test scenarios across the parser's edge cases and the recognizer (p=5.53)

Run order: 1 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 12, 15, 18, and 19; the `command.ts` bullet of "File read"). Depends on nothing. Subplans 2, 3, 4, 5, and 8 build on it: 2 and 3 take `FileReadArgs`, 3 answers with `FILE_READ_USAGE`, 4 fills the same defaults on the far side, 5 parses typed input with `parseFileRead`, and 8 puts `FILE_READ_PRIMER` and `isFileReadCommandLine` in the tool table.

The series adds a workspace-side `file read` tool and moves janissary's ACP tool loop to the far side for remote runs. This first piece is the pure grammar the rest of the series parses with: the argument parser, the primer slice an agent sees, and the recognizer the tool loop's extractor uses to find a `file read` line in a reply. It touches no disk and nothing calls it yet.

## Design decisions

- **Grammar** (source decision 12): `file read <path> [--offset <line>] [--limit <lines>]`. The input is trimmed and split on `/\s+/`, the way `parseBrowserCommand` in `src/browser/command.ts` splits its own (`rest.split(/\s+/)`). The first token must be `file` and the second `read`, each compared case-insensitively. The remaining tokens are scanned left to right:
  - `--offset` or `--limit` (exact, lowercase match) consumes the next token as its value, whatever that token is. So `--limit --offset 5` gives `--limit` the value `--offset`, which fails validation.
  - Any other token starting with `--`, including `--limit=5` and a misspelled `--ofset`, is a usage error. Only the space-separated form is in the grammar.
  - Every other token is the path. The first one is kept; a second is a usage error.
  - So the flags may appear in either order, before or after the path.
- **Path as given.** The parser returns the path token exactly as typed, case and all. It does not normalize, resolve, or strip quotes from it, because every error line in source decision 17 names `<path>` as the caller gave it, and subplan 3 contains and resolves it. A quoted path such as `"a.md"` is therefore looked up with its quote characters and reported as not found by the reader; quoting is not part of the grammar.
- **Defaults and bounds** (source decision 15): `--offset` is 1-based and defaults to 1. `--limit` defaults to 2000 and may not exceed 2000. The parser returns both values filled in, so no caller restates a default. The number lives in one exported constant, `FILE_READ_MAX_LIMIT`, so subplan 4's far-side fill-in can import it instead of writing 2000 again. `--offset` has no upper bound here; an offset past the end of the file is the formatter's error (subplan 2).
- **Integer values.** A flag value is valid only when it is all ASCII digits, parses to a safe integer (`Number.isSafeInteger`), and is at least 1. That rules out `0`, `-3`, `1.5`, `abc`, `+5`, `1e3`, `0x10`, and a value beyond `Number.MAX_SAFE_INTEGER`. Leading zeros are accepted (`007` is 7). The check lives in one private helper used by both flags, which keeps `parseFileRead` under the `sonarjs/cognitive-complexity` limit.
- **Usage** (source decision 18): every parse error returns exactly `{ error: FILE_READ_USAGE }`, where `FILE_READ_USAGE` is `Usage: file read <path> [--offset <line>] [--limit <lines>]`. There is no more specific message for any case, so the order in which the checks run does not matter. The error cases are:
  - bare `file`, or input whose first token is not `file`;
  - `file read` with no path;
  - an unknown `file` subcommand;
  - a `--offset` or `--limit` value that fails the integer rule above, including a flag with no value after it;
  - a `--limit` above 2000;
  - a second positional token after the path;
  - an unknown `--` token;
  - the same flag given twice. Taking the last value would silently drop the first, which is the same reason a second path is refused.
- A second positional token is refused because the grammar names one path, and accepting a second would silently drop it. Paths containing spaces are therefore not expressible. `browser use <id>` has the same limit, but it silently ignores extra tokens (`tail[0]` in `parseBrowserCommand`); `file read` refuses them instead.
- **Prefix.** The parser accepts text starting at `file`. It does not strip a `janissary ` prefix: `extractAgentCommand` in `src/agent/command-tools.ts` already removes it (`finalLine.replace(/^janissary\s+/i, '')`) before any agent-run command reaches a runner.
- **Primer slice** (source decision 19), exactly three lines joined with `\n`, the way `BROWSER_PRIMER` and `QUESTION_PRIMER` are built:
  - `To read a file in the workspace, end your reply with one line:`
  - `file read <path> [--offset <line>] [--limit <lines>]`
  - `Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.`
- **Recognizer**: a cleaned reply line is a `file read` command when it starts with `file`, one or more whitespace characters, then `read`, followed by whitespace or the end of the line, case-insensitively. It is an anchored regex test like `isQuestionCommandLine` in `src/question-command.ts` (`/^question\s+(ask|approve)\b/i`), but it ends with whitespace-or-end rather than `\b`. That matters because `toolExtractor` in `src/acp/tool-table.ts` accepts a line only when `nativeCommandName(line)` is also defined, and `nativeCommandName` in `src/acp/native-commands.ts` compares whole whitespace-split words. With `\b`, `file read-x` would pass the recognizer but not `nativeCommandName`. With whitespace-or-end the two agree.
- The recognizer does not validate the arguments. A malformed line such as `file read` alone or `file read a.md --limit 9999` is still extracted, so the agent gets the usage line back as its tool result instead of having its reply treated as a final answer. The line it sees has already been through `cleanCommandLine` in `src/acp/command-line.ts`, so it needs no trimming or prompt-marker handling of its own.
- **No extractor function.** `src/browser/command.ts` and `src/question-command.ts` each export an `extract…Command` helper, but the tool loop extracts through `toolExtractor` over each tool's `isCommandLine`, and neither helper has a production caller. This module adds none.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| A parser, primer, and line recognizer kept together in one pure module | `parseBrowserCommand`, `BROWSER_PRIMER`, `isBrowserCommandLine` in `src/browser/command.ts` |
| The `ParsedX \| { error: string }` result shape, and a usage constant exported beside its parser | `parseQuestionCommand` and `QUESTION_USAGE` in `src/question-command.ts` |
| An anchored, case-insensitive line recognizer | `isQuestionCommandLine` in `src/question-command.ts` |
| The cleaning every reply line gets before a recognizer sees it | `cleanCommandLine`, `findLastCommandLine` in `src/acp/command-line.ts` |
| The whole-word native-name match the recognizer must agree with | `nativeCommandName` in `src/acp/native-commands.ts`; its use in `toolExtractor`, `src/acp/tool-table.ts` |

## Proposed changes

New directory `src/file-read/` with one new file, `src/file-read/command.ts`. It is pure and imports nothing at all: no `Managers`, no command registry, no filesystem, and not `src/acp/command-line.ts`, since it has no extractor. The far side imports it through subplan 3's reader and subplan 8's tool table, and later subplans add `format.ts`, `read.ts`, and `tab-read.ts` beside it. It exports:

- `FileReadArgs`: an object type with `path` (string), `offset` (number), and `limit` (number), all required.
- `FILE_READ_MAX_LIMIT`: 2000, both the default and the maximum `--limit`.
- `FILE_READ_USAGE`: the usage line above, exported so the typed command (subplan 5) and the workspace runner (subplan 3) answer with the same string.
- `parseFileRead(input)`: returns `FileReadArgs | { error: string }`, applying the rules above; callers tell the two apart with `'error' in parsed`, as `runQuestionCommand` does. It accepts the whole command text, starting at `file`.
- `FILE_READ_PRIMER`: the three-line slice above.
- `isFileReadCommandLine(line)`: the recognizer above.

The file should land around 55 lines, far under the 200-line `max-lines` limit. Both regexes are simple anchored patterns with no nested quantifiers, so `security/detect-unsafe-regex` does not fire.

## Tests

New `src/file-read/command.test.ts`, in the style of `src/browser/command.test.ts`:

- defaults: `file read notes/a.md` gives `{ path: 'notes/a.md', offset: 1, limit: 2000 }`;
- both flags, in either order and on either side of the path (`file read --limit 5 a.md --offset 3` and `file read a.md --offset 3 --limit 5` give the same result);
- `--limit 2000` is accepted and `--limit 2001` is a usage error;
- leading zeros: `--offset 007` gives offset 7;
- every usage form returns exactly `{ error: FILE_READ_USAGE }`:
  - bare `file`, `file read`, `file write x`, and `read x`;
  - `--offset 0`, `--offset -3`, `--offset 1.5`, `--offset 1e3`, and an offset above `Number.MAX_SAFE_INTEGER`;
  - `--limit abc`, a trailing `--limit` with no value, and `--limit --offset 5`;
  - `--limit=5` and `--ofset 5`;
  - `--limit 5 --limit 10`;
  - a second positional path;
- case-insensitive keywords: `FILE READ notes/a.md` parses, and `file read Notes/A.md` keeps the path's case;
- the path is returned verbatim: `./notes/a.md` stays `./notes/a.md`;
- surrounding and repeated whitespace, including a tab between tokens, parses;
- `FILE_READ_PRIMER` equals the three lines joined with `\n` exactly;
- `isFileReadCommandLine` accepts `file read x`, `file read` alone, `FILE  READ x`, and `file read --limit 9999`, and rejects `files x`, `file`, `filed read x`, and `file read-x`.

## Out of scope

Reading the disk and formatting lines (subplans 2 and 3). Registering a `file` command or adding `file read` to the native vocabulary (subplans 5 and 6). Any tool-table entry (subplan 8). Quoting paths or paths with spaces.

## Verification

Run `$janissary/scripts/run.mjs check-diff`: it lints the new files, typechecks, and runs `src/file-read/command.test.ts`. Confirm `src/file-read/command.ts` has no `import` lines. There is no manual end-to-end check yet, because nothing user-visible changes until subplan 5 registers the typed command and subplan 8 adds the tool.
