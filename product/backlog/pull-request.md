<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Fix the files help-table rendering so its summary stays in one cell.

Existing Issue: The `files` row uses unescaped `|` characters inside the `<name|size|modified|permissions>` code span, which Markdown treats as table separators and renders as extra cells. Severity: 4/10

Existing Risk: 4/10 - Readers see a malformed commands table and cannot reliably distinguish the new `files` summary from adjacent columns.

Proposal Risk: 1/10 - Escaping the separators keeps the summary in one cell, while a source-level regression assertion catches future unescaped delimiters.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "escape separators in the files command summary". In `help/commands.md`, escape the mode separators as Markdown table content so the `files` description renders as one cell. Update the syntax assertion in `src/commands.test.ts` to check the escaped source form and add an assertion that the row contains no unescaped table separators; retain the command-row length, ordering, and help-page coverage. Verify the rendered command table keeps the full mode list inside the `files` description.
