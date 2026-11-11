# ACP tool loop 1 — `file read` parser, primer slice, and line recognizer

**Complexity: 4/10** — ~55 added lines in one new module, 6 requirements, 18 scenarios (p=4.95)

Run order: 1 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decisions 12, 15, 18, and 19; the `command.ts` bullet of "File read"). Depends on nothing. Subplans 2, 3, 5, and 8 use it.

The series adds a workspace-side `file read` tool and moves janissary's ACP tool loop to the far side for remote runs. This first piece is the pure grammar the rest of the series parses with: the argument parser, the primer slice an agent sees, and the recognizer the tool loop's extractor uses to find a `file read` line in a reply. It touches no disk and nothing calls it yet.

## Design decisions

- **Grammar** (source decision 12): `file read <path> [--offset <line>] [--limit <lines>]`. The input is split on whitespace the way `parseBrowserCommand` in `src/browser/command.ts` splits its own, and the leading `file` and `read` words match case-insensitively. The flags may appear in either order, before or after the path.
- **Defaults and bounds** (source decision 15): `--offset` is 1-based and defaults to 1. `--limit` defaults to 2000 and may not exceed 2000. The parser returns both values filled in, so no caller restates a default.
- **Usage** (source decision 18): each of these prints exactly `Usage: file read <path> [--offset <line>] [--limit <lines>]`:
  - bare `file`;
  - `file read` with no path;
  - an unknown `file` subcommand;
  - a non-positive or non-integer `--offset` or `--limit`, including a flag with no value after it;
  - a `--limit` above 2000.
- A second positional token after the path is also a usage error. The grammar names one path, and accepting a second would silently drop it. Paths containing spaces are therefore not expressible, the same limit `browser use <id>` has.
- **Primer slice** (source decision 19), exactly three lines joined with newlines:
  - `To read a file in the workspace, end your reply with one line:`
  - `file read <path> [--offset <line>] [--limit <lines>]`
  - `Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.`
- **Recognizer**: a cleaned reply line is a `file read` command when it begins with the words `file read` followed by whitespace or the end of the line, case-insensitively, the same shape `isQuestionCommandLine` in `src/question-command.ts` uses. It does not validate the arguments; a malformed line is still extracted, so the agent gets the usage line back as its tool result instead of having its reply treated as a final answer.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| A parser, primer, and line recognizer kept together in one pure module | `parseBrowserCommand`, `BROWSER_PRIMER`, `isBrowserCommandLine` in `src/browser/command.ts` |
| The `{ error }` result shape parsers return | `parseBrowserCommand`, `parseQuestionCommand` in `src/question-command.ts` |

## Proposed changes

New `src/file-read/command.ts`, pure, importing nothing from `Managers`, the command registry, or the filesystem, because the far side imports it in subplan 18:

- `FileReadArgs`: the parsed `path`, `offset`, and `limit`, with both numbers always present.
- `FILE_READ_USAGE`: the usage line above, exported so the typed command (subplan 5) and the workspace runner (subplan 3) answer with the same string.
- `parseFileRead(input)`: returns `FileReadArgs` or `{ error: FILE_READ_USAGE }`, applying the rules above. It accepts the whole command text, starting at `file`.
- `FILE_READ_PRIMER`: the three-line slice above.
- `isFileReadCommandLine(line)`: the recognizer above.

## Tests

New `src/file-read/command.test.ts`:

- defaults: `file read notes/a.md` gives offset 1 and limit 2000;
- both flags, in either order and on either side of the path;
- `--limit 2000` is accepted and `--limit 2001` is a usage error;
- every usage form: bare `file`, `file read`, `file write x`, `--offset 0`, `--offset -3`, `--offset 1.5`, `--limit abc`, a trailing `--limit` with no value, and a second positional path;
- case-insensitive `FILE READ notes/a.md`;
- `FILE_READ_PRIMER` equals the three lines exactly;
- `isFileReadCommandLine` accepts `file read x` and `file read` alone, and rejects `files x`, `file`, and `filed read x`.

## Out of scope

Reading the disk (subplans 2 and 3). Registering a `file` command or adding `file read` to the native vocabulary (subplans 5 and 6). Any tool-table entry (subplan 8).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
