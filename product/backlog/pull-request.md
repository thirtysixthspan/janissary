<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bound the command-help length exception for the expanded `files` row.

Existing Issue: `src/commands.test.ts` now exempts any description containing `files print <tab>` from the 200-character check, so the entire `files` command-table description can grow without a regression failure. Severity: 3/10

Existing Risk: 3/10 - Later edits can make the command table's `files` row unwieldy without any test failure, weakening the existing length guard for this row.

Proposal Risk: 1/10 - A fixed allowance for the planned `files` wording still permits the required text while making further growth test-visible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "bound the files command-help length exception". In `src/commands.test.ts`, retain the 200-character maximum for ordinary rows and replace the substring exclusion with a check that identifies the `files` row and enforces an explicit maximum sized to its planned description in `help/commands.md`. Assert that this row remains below that bound, while preserving the existing command-page and alphabetical-order checks. This keeps the complete planned wording and prevents the exception from becoming unlimited.
