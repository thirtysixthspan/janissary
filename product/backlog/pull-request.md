<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's whitespace preservation coverage for added hunk lines.

Existing Issue: The hunk parser tests assert an empty added line but never assert that an added line preserves leading and trailing spaces and tabs as the plan requires. Severity: 4/10

Existing Risk: 4/10 - A future parser change could trim indentation or trailing whitespace from added lines without the promised regression test detecting it.

Proposal Risk: 1/10 - Whitespace corruption remains possible in other paths, but a literal assertion would detect it in the covered added-line parser path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "complete added hunk line whitespace coverage". Extend src/file-patch/parse-hunks.test.ts with an added hunk line containing leading and trailing spaces and tabs, and assert its exact text after the prefix is removed. Retain the existing context, removal, and empty-line cases and run the diff-scoped checks.
