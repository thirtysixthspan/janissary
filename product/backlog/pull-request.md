<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the technical debt of a ready plan still targeting the removed help file.

Existing Issue: `product/plans/ready/arranging-tabs-from-the-command-line.md` still assigns the future `tab` command row to `help.md` and describes `src/commands.test.ts` as checking that file, although this pull request removes it and makes `help/commands.md` plus one page per command the contract. Severity: 4/10

Existing Risk: 5/10 - An implementation following this ready plan can write an orphaned `help.md` row, miss the required `help/tab.md` page, and discover the mismatch only when command coverage fails or shipped help remains stale.

Proposal Risk: 2/10 - Correcting the plan will align its future help steps with the active table and page-coverage contract, leaving only the usual chance that implementation details change later.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "update the tab-arrangement plan for command help pages". In `product/plans/ready/arranging-tabs-from-the-command-line.md`, replace the active `help.md` references in its design decisions, reuse table, proposed changes, implementation order, and tests with `help/commands.md`. Add `help/tab.md` to the proposed changes and implementation order, specifying that it documents the expanded `tab` forms in the canonical command-page layout, and update the test description to match `src/commands.test.ts` checking the current command table and requiring a page for every command. Verify that the plan no longer directs work to the deleted file and accounts for both the command row and the required `tab` page.
