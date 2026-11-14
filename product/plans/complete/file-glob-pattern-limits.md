# Bound file glob patterns so an agent-written pattern cannot freeze the server

**Complexity: 5/10** — ~45 added production lines across 3 edited files plus one new module, 7 behavioral requirements, 10 test scenarios (p=5.40)

`file glob` hands its pattern to minimatch, which compiles each name segment to a backtracking regular expression and runs it synchronously on the main event loop against every walked name. The 30-second deadline is checked only between directory reads, so one slow match cannot be interrupted.

Measured with the project's minimatch 10.2.5 and the exact options `createGlobMatcher` uses:

- `*?` repeated 12 times then `Z` (the backlog's example) against a 60-character name: one `match` call took 107.9 seconds.
- `*?` repeated n times against a 30-character name grows about 3x per extra pair: 0.3 ms at 4, 16 ms at 7, 370 ms at 10.
- Five `*` in one name (`*a*a*a*a*aZ`) against a 255-character name: 41.8 s. Four `*`: 840 ms. Three `*`: 12.5 ms. `?` alone is linear.
- Four extglob groups (`+(a|aa)` x4 then `Z`) against a 60-character name: 62.5 s. With `noext: true` the same pattern is literal and answers in under 0.1 ms.
- `{a,b}` repeated 16 times expands to 65,536 alternatives and takes 13.2 s just to compile; 64 alternatives compile in 0.2 ms.
- Interleaved `**` segments against a 100-folder-deep path stay under 1 ms, so globstars need no cap of their own.

## Goal

A pattern that could compile to a catastrophically slow matcher is refused up front with a clear one-line message, while every documented pattern shape (`**`, `*`, `?`, `{a,b}`) keeps working within generous caps. The matcher itself refuses the same patterns so the far side of a remote `glob-paths` request, which walks without parsing a command line, is covered too.

## Approach

1. **New module `src/file-glob/pattern-limits.ts`.** Export `FILE_GLOB_MAX_PATTERN_LENGTH = 1024`, `FILE_GLOB_MAX_NAME_STARS = 3`, `FILE_GLOB_MAX_ALTERNATIVES = 64`, a message constant `FILE_GLOB_TOO_COMPLEX` (`Pattern too complex: use at most 1024 characters, three * wildcards in one name, and 64 {a,b} combinations.`), and `isGlobPatternTooComplex(pattern)`. It checks length first, then brace-expands with minimatch's `braceExpand` capped at one past the alternatives limit, rejects too many alternatives, and finally counts runs of `*` in each `/`-separated name of each alternative, skipping a name that is exactly `**` (a globstar). A run such as `***` counts once, matching how minimatch treats it. `?` is not counted because it cannot backtrack.
2. **`src/file-glob/match.ts`.** Return the match-nothing predicate when `isGlobPatternTooComplex` is true, and add `noext: true` to the minimatch options so undocumented extglob groups (`+(…)`, `@(…)`, `!(…)`, `*(…)`, `?(…)`) are matched literally rather than compiled to nested quantifiers. Update the comment to say the option set also disables extglobs.
3. **`src/file-glob/command.ts`.** In `parseFileGlob`, after the limit check, return `{ error: FILE_GLOB_TOO_COMPLEX }` when the pattern is too complex. This covers typed lines, agent tool lines, and the far-side `glob-paths` command path that goes through `globWorkspaceCommand`.
4. **`src/remote/filesystem/glob-paths-operation.ts`.** Make `valid` reject a too-complex `pattern` so an invalid far-side request is refused as invalid arguments rather than walked.

## Tests

- `src/file-glob/pattern-limits.test.ts`: the boundary on each cap (1024 vs 1025 characters; three vs four `*` in one name; 64 vs 65 alternatives); stars in different names and `**` globstars do not count; `***` counts once; ordinary patterns `**/*.test.ts`, `*.{js,md}`, `*-*-*.ts`, and `{*.ts,*.js}` (stars split across alternatives) are allowed.
- `src/file-glob/command.test.ts`: `parseFileGlob` returns the too-complex message for an over-cap pattern and parses a pattern at the cap.
- `src/file-glob/match.test.ts`: the backlog's `*?` x12 pattern answers `false` against a 60-character name in well under a second; an extglob group is matched literally.
- `src/remote/filesystem/operations.test.ts`: a `glob-paths` request with a too-complex pattern is an invalid request.

Existing pattern tests in `src/file-glob/match.test.ts`, `src/file-glob/glob.test.ts`, and `src/commands/file.test.ts` keep passing untouched.

## Docs and specs

- `help/file.md`: add the caps and the message to the Finding files pattern paragraph and the errors paragraph; note extglob groups are literal.
- `product/specs/acp.md` `### File glob`: state the caps, the message, and that extglobs are not supported.
- `product/specs/remote-server.md` version 42 paragraph: a too-complex pattern is an invalid request.

## Out of scope

- Moving matching off the main event loop or adding a per-match timeout.
- Naming the caps in the agent primer; the refusal message names them when an agent exceeds one.
- Caps on `?`, globstars, or bracket classes, which measured as linear.
