# Share one set of line-detection predicates for file exists, head and tail

**Complexity: 4/10** — ~14 added lines across 4 production files, 6 requirements, 8 scenarios and 2 new pure predicates (p=5.069)

## Goal

Stop keeping three copies of the same `^file …` recognition grammar for the new `file exists`, `file head` and `file tail` commands. `file list` and `file stat` already export pure predicates from their command modules and every caller imports them. Exists, head and tail should work the same way: one definition each, imported wherever the app decides whether a line is one of those commands.

## Approach

Add `isFileExistsCommandLine(line)` to `src/file-exists/command.ts` and `isFileHeadTailCommandLine(line)` to `src/file-head-tail/command.ts`, beside their parsers. Each is a pure function that returns the result of a case-insensitive `^file\s+(...)(\s|$)` test, matching the shape and style of `isFileListCommandLine` in `src/file-list/command.ts` and `isFileStatCommandLine` in `src/file-stat/command.ts`. No state, no I/O, no managers.

`src/acp/tool-table.ts` currently declares `FILE_EXISTS_HEAD_TAIL_LINE` locally and uses it in two places: the file tool's `isCommandLine` (reply extraction) and `gateAgentCommand` (refusing agent-issued commands). Replace both uses with `isFileExistsCommandLine(line) || isFileHeadTailCommandLine(line)` and drop the local regex. The disjunction recognizes exactly the same lines as the combined `exists|head|tail` pattern.

`src/acp/workspace-runner.ts` declares `FILE_EXISTS_LINE` and `FILE_HEAD_TAIL_LINE` and uses them in the two routing branches just before the `readWorkspaceCommand` fall-through. Replace each `.test(normalized)` call with its matching shared predicate and drop both local regexes. Keep the branch order and the bare-line behavior: a bare `file exists` still reaches `parseFileExists` and answers with its usage line, and an unrecognized line still falls through to file read.

`src/acp/file-primer.ts` needs no change. It already imports only pure primer constants from command modules, and the new predicates come from those same pure modules, so the ACP table and runner pick them up without pulling a manager into either import graph.

## Implementation steps

1. Export `isFileExistsCommandLine` from `src/file-exists/command.ts` using `/^file\s+exists(\s|$)/i`, directly below `parseFileExists`.
2. Export `isFileHeadTailCommandLine` from `src/file-head-tail/command.ts` using `/^file\s+(?:head|tail)(\s|$)/i`, directly below `parseFileHeadTail`.
3. In `src/acp/tool-table.ts`, import both predicates from their defining modules with `.js` extensions, replace the two `FILE_EXISTS_HEAD_TAIL_LINE.test(…)` calls with `isFileExistsCommandLine(…) || isFileHeadTailCommandLine(…)`, and remove the unused local constant.
4. In `src/acp/workspace-runner.ts`, import both predicates from their defining modules with `.js` extensions, replace `FILE_EXISTS_LINE.test(normalized)` and `FILE_HEAD_TAIL_LINE.test(normalized)` with the shared predicates, and remove the two unused local constants.
5. Run `$janissary/scripts/run.mjs check-diff` after each step, fixing any lint, typecheck or test failure before continuing.

## Tests

- Add cases to `src/file-exists/command.test.ts` for `isFileExistsCommandLine`: recognizes `file exists <path>` and a bare `file exists`, is case-insensitive, tolerates repeated whitespace including tabs, and rejects lookalikes such as `file exist <path>`, `file existing <path>` and `files exists <path>`.
- Add cases to `src/file-head-tail/command.test.ts` for `isFileHeadTailCommandLine`: recognizes both `file head <path>` and `file tail <path>` with and without `-n`, is case-insensitive, tolerates tabs, and rejects lookalikes such as `file heading <path>` and `files tail <path>`.
- `src/acp/tool-table.test.ts` and `src/acp/workspace-runner.test.ts` already cover recognized, malformed and refused lines for all five new commands, extraction of trailing lines, and the file-read fall-through. They must pass unchanged.
- Run `$janissary/scripts/run.mjs check-diff` after writing tests.

## Specs and documentation

Behavior-preserving refactor: the recognized lines, branch order and refusal messages are unchanged. The recognized forms are already described in `product/specs/file-exists.md`, `product/specs/file-head-tail.md` and the ACP spec's command-recognition sections. No spec, `help/` or `documentation/user-documentation/` edits are needed, and none are in scope.

## Out of scope

- Changing which lines are recognized, the usage text, route order, gate decisions or any user-visible output.
- Editing `src/acp/file-primer.ts` or any primer text.
- Restructuring the other command-line predicates or the tool table itself.
- Changing the PR description, title, or any recorded backlog entry other than this one.
