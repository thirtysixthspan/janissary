<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the millisecond documentation repair so the help page's inline mtime example matches the formatter.

Existing Issue: The new "Listing and inspecting paths" section of help/file.md describes a row's modification time as "an ISO UTC timestamp such as `2026-11-19T13:50:00Z`", a shape the formatter never emits, immediately beside the corrected `2026-11-19T13:50:00.000Z` example row. Severity: 2/10

Existing Risk: 2/10 - A reader treats the inline example as the output contract and compares or parses real rows against a timestamp without milliseconds, and the earlier repair stays only partially delivered.

Proposal Risk: 1/10 - A documentation-only edit removes the stale spelling while the row-shape assertions in src/file-row.test.ts and the list, stat, and remote tests already pin the correct output.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "correct the stale inline mtime example in help/file.md". In the "Listing and inspecting paths" section of help/file.md, change the inline example `2026-11-19T13:50:00Z` in the phrase describing the modification time to `2026-11-19T13:50:00.000Z`, leaving the adjacent example row and every other paragraph unchanged. This completes the goal stated in product/plans/complete/correct-file-row-example-milliseconds.md, whose Problem section identifies exactly this no-millisecond spelling as describing a shape the formatter never produces. Do not change src/file-row.ts or any test, since its assertions already pin the millisecond output. Verify by re-reading the paragraph against the row-shape assertion in src/file-row.test.ts.


* Share the new file subcommand line-detection predicates with the typed dispatcher instead of redefining them locally.

Existing Issue: src/commands/file.ts defines local regex helpers for `file exists`, `file head`, and `file tail` even though the command modules export `isFileExistsCommandLine` and `isFileHeadTailCommandLine`, and the same dispatcher already imports `isFileListCommandLine` and `isFileStatCommandLine`. Severity: 3/10

Existing Risk: 4/10 - A future change to the canonical predicates, such as a new alias or a word-boundary fix, reaches the ACP gate and workspace runner but not typed dispatch, so the two routes silently disagree about which lines are commands.

Proposal Risk: 2/10 - The dispatcher imports the same exported predicates the other routes use, leaving one definition per subcommand, with the existing lookalike and dispatch cases in src/commands/file.test.ts covering the behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "share the new file command line predicates with the typed dispatcher". In src/commands/file.ts, delete the local `isFileExistsCommandLine`, `isFileHeadCommandLine`, and `isFileTailCommandLine` regex helpers and import `isFileExistsCommandLine` from src/file-exists/command.ts and `isFileHeadTailCommandLine` from src/file-head-tail/command.ts, using the latter for the combined head-or-tail branch of `fileOutput`. This matches the existing imports of `isFileListCommandLine` and `isFileStatCommandLine` and the plan's decision to share line-detection predicates across routes. No behavior change is intended; keep the existing dispatch, lookalike-fall-through, and one-transcript-entry assertions in src/commands/file.test.ts passing untouched, and add only a check that a `file ls` line still reaches the list executor if that coverage is missing.
