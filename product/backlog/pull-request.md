<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the pull request description's stale "six behavior specs" claim, which lists and changes seven spec files.

Existing Issue: The pull request body says "The six behavior specs were reconciled with this routing" while parenthetically listing seven files (acp.md, acp-records.md, connection.md, connections-tab.md, editor-tab.md, monitoring.md, roles.md), and the aggregate diff changes all seven product/specs files; the original ready plan named six, with acp-records.md added later. Severity: 2/10

Existing Risk: 3/10 - A reviewer relying on the change-set count miscounts the reconciliation scope and may overlook that acp-records.md was also updated, or simply trusts a statistic the diff does not support.

Proposal Risk: 1/10 - Removing the number leaves the enumerated file list intact, so the only residual risk is a marginally less precise sentence, which the following file list resolves on its own.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "remove the stale behavior-spec count from the pull request description". Edit only that sentence of the pull request body to drop the count, for example "The behavior specs were reconciled with this routing (...)", leaving the parenthesized file list exactly as written and every other paragraph byte-for-byte unchanged. Per the change-set-statistic rule, remove the wrong count rather than replacing it with seven. Do not change the title, any source file, spec, or any other description text. Verify with gh pr view 2185 --json body that no "six behavior specs" wording remains, that the file list and all other paragraphs are intact, and that the pull request is still OPEN.
