<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close custom-role core sessions when their tab closes, which the built-in-role cleanup loop currently leaves running.

Existing Issue: AcpSessionManager.closeTab iterates only the two built-in ACP role names, so a core session opened under a roles-file custom role survives tab close, dispose and closeAll even though the connection spec promises that closing a tab kills every core role session it holds. Severity: 5/10

Existing Risk: 5/10 - Each close of a tab that used a custom-role persona leaves that role's ACP subprocess and session holder alive, accumulating orphaned processes and stale session state across repeated tabs.

Proposal Risk: 3/10 - Iterating the tab's actual held role keys reuses the existing per-role close and delete settlement path, and the ask-and-tell close tests pin the behavior that must not move; copying the key list avoids mutation during settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "close every core role session for a tab on tab close, including custom roles". In src/acp/session-manager.ts, change AcpSessionManager.closeTab to settle and close every role currently held for the label by iterating a copy of that label's role-session map keys rather than the built-in ACP_ROLES constant, so custom roles from the roles file are also closed and their subprocesses killed; keep the per-role close, closeAll and dispose paths otherwise unchanged. Because the close settlement callback deletes entries from the map through deleteSession, iterate a snapshot of the keys to avoid skipping roles. In src/acp/manager.test.ts, extend the existing closeAll coverage with a custom-role session and assert that closing the tab closes both the custom role and the built-in roles, while the existing closeAll, cancellation and role-state tests keep passing untouched. Cross-check the lifecycle claim in product/specs/connection.md that closing a tab kills every core role session.
