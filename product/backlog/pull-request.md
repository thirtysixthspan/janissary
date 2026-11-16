<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's error line-number coverage with and without a leading envelope.

Existing Issue: The parser tests exercise only four representative errors with a leading envelope, leaving the other explicitly planned error cases without both line-number assertions. Severity: 4/10

Existing Risk: 4/10 - A future change to envelope handling or a particular error path could report an incorrect line number without the promised regression coverage detecting it.

Proposal Risk: 1/10 - Incorrect line numbers remain possible, but the expanded cases would detect regressions in the covered paths.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "complete parser error line-number coverage with and without a leading envelope". Extend the parameterized cases in src/file-patch/parse.test.ts so the unknown-marker, missing-path, misplaced-move, and invalid-add cases named by product/plans/complete/file-patch-1-patch-section-parser.md assert their exact error line and text both with and without a leading Begin Patch line; preserve the separate no-file-sections expectations for empty and envelope-only input. Run the diff-scoped checks and confirm the parser tests pass.
