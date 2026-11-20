# Share the file command line-detection predicates with the typed dispatcher

**Complexity: 2/10** — one production file, ~3 added lines, 2 detection requirements and 4 preserved dispatch scenarios (p=3.54).

`src/commands/file.ts` defines three local regex helpers — `isFileExistsCommandLine`, `isFileHeadCommandLine`, and `isFileTailCommandLine` — even though the command modules already export the same detection as `isFileExistsCommandLine` (`src/file-exists/command.ts`) and `isFileHeadTailCommandLine` (`src/file-head-tail/command.ts`). The dispatcher already imports the analogous `isFileListCommandLine` and `isFileStatCommandLine` from their command modules, so typed dispatch is the one route still maintaining its own copies. A future change to a canonical predicate (a new alias or a word-boundary fix) would reach the ACP gate and workspace runner but silently miss typed dispatch.

## Goal

Make typed dispatch use the same exported line-detection predicates the other routes use, leaving exactly one definition per subcommand. Detection behavior, dispatch order, lookalike fall-through, and the single-transcript-entry guarantee are unchanged.

## Approach

Delete the three local regex helpers from `src/commands/file.ts`. Add two imports alongside the existing `isFileListCommandLine` and `isFileStatCommandLine` imports: `isFileExistsCommandLine` from `../file-exists/command.js` and `isFileHeadTailCommandLine` from `../file-head-tail/command.js`. In `fileOutput`, keep the exists branch calling `isFileExistsCommandLine` (now imported) and replace the `isFileHeadCommandLine(line) || isFileTailCommandLine(line)` condition with the single combined `isFileHeadTailCommandLine(line)`. The exported predicate uses the identical `/^file\s+exists(\s|$)/i` and `/^file\s+(?:head|tail)(\s|$)/i` patterns, so no observable behavior changes and no executor, parser, or spec surface moves.

## Implementation steps

1. In `src/commands/file.ts`, add the two imports with `.js` extensions next to the existing predicate imports, and delete the three local helper functions.
2. Replace the combined head-or-tail condition in `fileOutput` with `isFileHeadTailCommandLine(line)`; leave every other branch and the fall-through untouched.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests are required: this is a behavior-preserving refactor whose regression net already exists in `src/commands/file.test.ts`. The existing `new subcommand dispatch` cases cover list and its `ls` alias, stat, exists, head, tail, lookalike fall-through to the read usage line, one transcript entry per typed input, and a sample per subcommand; all must pass unchanged. Confirm the `file ls` line still reaches the list executor — that assertion already exists in the `dispatches list and its ls alias to the list executor` case, so add nothing if it is present.

## Out of scope

- No change to detection semantics, dispatch order, executor behavior, parsers, ACP gate, workspace runner, protocol version, help pages, or specs.
- No new modules, no re-export barrels, no comments, and no changes to `src/commands/file.test.ts` beyond a `file ls` list-executor check only if that coverage is missing.
- No compaction or spacing changes to meet the 200-line limit; the edited file stays well under it.
