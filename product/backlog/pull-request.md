<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the remaining part of the Roles tab documentation fix, whose second tell paragraph still omits file write and file edit.

Existing Issue: The repair updated the defaults paragraph and the twelve-command count in the Roles tab page, but the paragraph beginning "The built-in ask role can read a file" still says Tell can only additionally create or delete databases and evaluate browser pages, so the same page now gives two contradictory lists of tell's default grants and the recorded proposal is only partly delivered. Severity: 4/10

Existing Risk: 4/10 - A user reading the Grant commands section believes the default tell role cannot write or edit workspace files and is surprised when a tell prompt mutates files.

Proposal Risk: 1/10 - Only documentation wording changes; if the edit were missed again, a grep for "evaluate browser pages" in the Roles tab page would show the stale list.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "add file write and file edit to tell in the Roles tab page's built-in ask/tell paragraph". In documentation/user-documentation/tab-types/roles.md, edit the paragraph beginning "The built-in **ask** role can read a file" so the Tell sentence says it can also create or delete databases, evaluate browser pages, and write and edit workspace files, and state that ask stays read-only for files, matching the tell and ask command lists in DEFAULT_ROLES in src/plugins/roles/roles-file.ts. No code or tests change; verify by reading the page and grepping documentation/ for "evaluate browser pages" and "database create/delete and browser eval" to confirm no stale tell list remains.
