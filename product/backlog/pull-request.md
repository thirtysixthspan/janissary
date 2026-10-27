<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that hidden paths are ignored by every view clause.

Existing Issue: The PR body says missing or hidden paths are ignored, but `expand` records an existing nested folder even while its parent is collapsed and reveals it as expanded later. Severity: 4/10

Existing Risk: 4/10 - A reader expects a hidden directory clause to be a no-op, then finds it unexpectedly expanded when they later open its parent.

Proposal Risk: 2/10 - The behavior remains somewhat surprising, but distinguishing directory clauses from row-selection clauses makes the command's effect predictable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "clarify hidden-path behavior in the files command description". Clarify PR #1803's description so it distinguishes directory operations from row selection: `expand` can record an existing nested directory even when a parent is collapsed, while `cursor`, `anchor`, and `select` ignore rows that are not visible when their clauses run. Make the corresponding wording precise in `product/specs/file-navigator-tab.md`. `applyStep` in `src/file-navigator/restore-command.ts` validates expansion with `stillDirectory` rather than row visibility, and `expandAndWatch` in `src/file-navigator/navigation.ts` records the directory. Add a focused case in `src/file-navigator/restore-command.test.ts` proving that a hidden nested directory remains expanded and is visible as expanded after its parent is expanded; preserve the ordered-clause and selection-fallback coverage.


* Fix the files help-table rendering so its summary stays in one cell.

Existing Issue: The `files` row uses unescaped `|` characters inside the `<name|size|modified|permissions>` code span, which Markdown treats as table separators and renders as extra cells. Severity: 4/10

Existing Risk: 4/10 - Readers see a malformed commands table and cannot reliably distinguish the new `files` summary from adjacent columns.

Proposal Risk: 1/10 - Escaping the separators keeps the summary in one cell, while a source-level regression assertion catches future unescaped delimiters.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "escape separators in the files command summary". In `help/commands.md`, escape the mode separators as Markdown table content so the `files` description renders as one cell. Update the syntax assertion in `src/commands.test.ts` to check the escaped source form and add an assertion that the row contains no unescaped table separators; retain the command-row length, ordering, and help-page coverage. Verify the rendered command table keeps the full mode list inside the `files` description.
