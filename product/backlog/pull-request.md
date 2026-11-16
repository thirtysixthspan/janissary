<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's coverage of a symbolic link's resolved content path.

Existing Issue: The link test checks the link's location and shared content identity but does not assert that its content entry records the target's real path as the plan requires. Severity: 4/10

Existing Risk: 4/10 - A regression that retains the link path as the content path could escape the promised test coverage and direct later writes or restoration at the wrong entry.

Proposal Risk: 1/10 - An incorrect path remains possible elsewhere, but an explicit assertion catches this link resolution regression in the covered case.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "complete symbolic link content path coverage". Extend the in-root link test in src/file-patch/view.test.ts to assert that the link's content realPath is the canonical target file path while its place location remains the link path, retaining the existing shared-content and read-once assertions. Run the diff-scoped checks.
