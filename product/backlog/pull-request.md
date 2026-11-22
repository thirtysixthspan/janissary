<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make the repair task's refiling of documentation findings an authorized action within its own scope declarations.

Existing Issue: The repair task's opening statement limits content updates to specs and applicable help, and its Allowed list names no write to `product/backlog/documentation.md`, yet the new refiling step requires appending a ready item there — a required action outside the task's declared scope. Severity: 6/10

Existing Risk: 5/10 - An agent honoring the scope declarations can skip the refiling, leaving a documentation finding stranded in the pull request backlog with no tracked documentation work and a repair that cannot resolve the entry.

Proposal Risk: 2/10 - The bookkeeping write becomes explicitly authorized while the two documentation trees remain forbidden, leaving only the normal triage of the refiled item by the documentation workflow.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2178 "authorize the repair task's refiling of documentation findings". In `ai/tasks/feature/work-pull-request-issue.md`, add `product/backlog/documentation.md` to the Allowed list as a file the repair may append a ready item to when a resolved entry asks for a change under `documentation/user-documentation/` or `documentation/developer-documentation/`, and extend the opening job statement's enumeration to name that refiling so the step promoting the plan and removing the entry is no longer asking for an action the declared scope excludes. Keep the exclusion intact: the repair still must not edit either documentation tree, and the documentation-backlog write is bookkeeping only, so state that explicitly beside the new allowance to keep the Forbidden rule against editing files the fix does not touch consistent. Leave the report template's Docs line, which already names the refiled item, unchanged. No tests exercise playbook prose; verify by reading the opening statement, Allowed list, Forbidden list, and the refiling step together and confirming the refiling write is authorized while both documentation trees remain off limits.
