<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the shell-tab spec's blanket marker tooltip claim, which still states the role-based name format for the newly added durable-record markers.

Existing Issue: The unchanged "The marker and link are decorations" paragraph still says the tooltip and accessible name are `Open acp:<role>:<tab name>` and that a running marker uses its active role record's connection name, while a record-target running marker's tooltip is `Open <record name>` (for example `Open subagent:research`) per the code and its ShellTab test, so the spec contradicts the behavior it now documents. Severity: 4/10

Existing Risk: 4/10 - A reader verifying the marker tooltip or accessible name against the spec expects the `acp:<role>:<tab name>` form for a subagent marker, writes a test or files a bug asserting the wrong label, and the documented decoration contract drifts from the one shipped.

Proposal Risk: 2/10 - The fix is documentation-only inside the Core ACP connections section and leaves marker code and tests untouched; the only remaining risk is a future edit restoring a blanket statement that ignores a new target kind.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct the shell-tab spec's marker tooltip claim for durable-record targets". In product/specs/shell-tab.md, revise the "The marker and link are decorations" paragraph of the Core ACP connections section so the tooltip and accessible-name rule distinguishes the two target kinds: role-target running markers keep `Open acp:<role>:<tab name>` and follow the active role record through fallback, while a durable-record target's running marker and settled link use `Open <record name>` named by the record and remain independent of any shell rename. Keep the new subagent paragraph's started/completion placement wording as-is. Verify against web/src/plugins/shell/thinking-marker-decoration.ts (fill sets title and aria-label to `Open ${view.name}`), web/src/plugins/shell/useShellReplyWriters.ts (runningView passes the receipt name for a record target, linkView passes the record name), and the record-marker assertions in web/src/plugins/shell/ShellTab.test.tsx that already assert `Open subagent:research`; no production behavior changes and those tests must keep passing untouched.
