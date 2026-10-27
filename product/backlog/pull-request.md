<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where completion suggests already-consumed `files` clauses.

Existing Issue: `keywordCandidates` in `src/completion/files.ts` always offers `in`, `on`, and `with` even after the completion parser marks each clause as used, although `parseFileNavigatorArgs` consumes each only once, so `files on left <Tab>` suggests `on` even though it becomes a trailing path. Severity: 3/10

Existing Risk: 3/10 - Choosing one of these suggestions can make completion produce a command that opens an unintended path or fails instead of adding a clause.

Proposal Risk: 1/10 - A different completion mismatch could remain if its state drifts from the parser, but tests can pin the once-only clauses and the remaining valid suggestions.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "filter already-used files clauses from completion". In `src/completion/files.ts`, pass the parsed `ClauseState` to `keywordCandidates` and omit `in`, `on`, and `with` when their corresponding `inSeen`, `onSeen`, or `withSeen` flag is set. Keep unused clauses, view keywords, and path matches in their current priority order. Extend `src/completion/files.test.ts` to check that each used clause disappears while other valid clauses and path matches remain available. Preserve the once-only parser behavior covered by `src/file-navigator/args.test.ts`.


* Bound the command-help length exception for the expanded `files` row.

Existing Issue: `src/commands.test.ts` now exempts any description containing `files print <tab>` from the 200-character check, so the entire `files` command-table description can grow without a regression failure. Severity: 3/10

Existing Risk: 3/10 - Later edits can make the command table's `files` row unwieldy without any test failure, weakening the existing length guard for this row.

Proposal Risk: 1/10 - A fixed allowance for the planned `files` wording still permits the required text while making further growth test-visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "bound the files command-help length exception". In `src/commands.test.ts`, retain the 200-character maximum for ordinary rows and replace the substring exclusion with a check that identifies the `files` row and enforces an explicit maximum sized to its planned description in `help/commands.md`. Assert that this row remains below that bound, while preserving the existing command-page and alphabetical-order checks. This keeps the complete planned wording and prevents the exception from becoming unlimited.
