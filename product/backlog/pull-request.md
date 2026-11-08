<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve the pull-request backlog heading when removing its last entry.

Existing Issue: The repair removed the final finding and the required `# pull-request` heading, leaving only the introductory comment. Severity: 2/10

Existing Risk: 2/10 - The backlog no longer matches its documented skeleton, which can confuse future review or repair runs that expect the heading.

Proposal Risk: 1/10 - Restoring the heading returns the empty backlog to its documented shape, though future last-entry removals could still repeat the mistake.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "preserve the pull-request backlog heading when clearing the last finding". In `product/backlog/pull-request.md`, retain the `# pull-request` heading after the final entry is removed so the empty file contains exactly the introductory comment, a blank line, and the heading. Check the backlog-draining behavior in the repair workflow that consumes this file and ensure its empty-state output preserves both required lines; no notification spec or runtime behavior should change.
