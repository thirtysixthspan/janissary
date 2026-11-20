<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the new file subcommand line-detection predicates with the typed dispatcher instead of redefining them locally.

Existing Issue: src/commands/file.ts defines local regex helpers for `file exists`, `file head`, and `file tail` even though the command modules export `isFileExistsCommandLine` and `isFileHeadTailCommandLine`, and the same dispatcher already imports `isFileListCommandLine` and `isFileStatCommandLine`. Severity: 3/10

Existing Risk: 4/10 - A future change to the canonical predicates, such as a new alias or a word-boundary fix, reaches the ACP gate and workspace runner but not typed dispatch, so the two routes silently disagree about which lines are commands.

Proposal Risk: 2/10 - The dispatcher imports the same exported predicates the other routes use, leaving one definition per subcommand, with the existing lookalike and dispatch cases in src/commands/file.test.ts covering the behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "share the new file command line predicates with the typed dispatcher". In src/commands/file.ts, delete the local `isFileExistsCommandLine`, `isFileHeadCommandLine`, and `isFileTailCommandLine` regex helpers and import `isFileExistsCommandLine` from src/file-exists/command.ts and `isFileHeadTailCommandLine` from src/file-head-tail/command.ts, using the latter for the combined head-or-tail branch of `fileOutput`. This matches the existing imports of `isFileListCommandLine` and `isFileStatCommandLine` and the plan's decision to share line-detection predicates across routes. No behavior change is intended; keep the existing dispatch, lookalike-fall-through, and one-transcript-entry assertions in src/commands/file.test.ts passing untouched, and add only a check that a `file ls` line still reaches the list executor if that coverage is missing.
