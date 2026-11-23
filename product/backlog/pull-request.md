<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the monitor's first flush after a reporting-tab reset, which the shared-session re-priming guard silently drops.

Existing Issue: A reset closes the owner tab's core role session and re-primes the persona, but the monitor's recorded core-session identity still holds the pre-reset session, so the first flush on the replacement session trips the rotation guard, discards its reply and re-primes a second time instead of delivering a suggestion. Severity: 5/10

Existing Risk: 5/10 - After every reporting-tab reset the user's next target change produces no suggestion and needs a second change, contradicting the monitoring spec and the pull request's verification claim that a later target change still produces a suggestion.

Proposal Risk: 2/10 - Clearing the recorded identity on the reset path is a single state change with the generation guard still intact, and a distinct-identity regression test closes the gap the current constant-identity fake leaves open.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "clear the monitor's recorded core session identity on a reporting-tab reset so the first post-reset flush delivers". In src/monitor/live-monitors.ts, in the LiveMonitors.reset method, clear the MonitorSub field that records the last answering core-session identity alongside the existing first-prompt re-prime, so the next answered flush seeds the new identity instead of comparing against the discarded one; leave the reset-generation, is-current, in-flight handling and the rotation guard itself otherwise untouched. In src/monitor/manager.test.ts, add a case that starts an external monitor, settles one flush with an explicit session identity using the fake ACP's reply-with-session helper, calls resetContext, emits a fresh target entry, flushes, settles that flush with a different identity, and asserts a new suggestion is delivered and the reply appears in the context snapshot; the existing reset tests settle every result with a constant identity and cannot catch this, so the new case must use two distinct identities. Verify the existing reset, stop, refusal and rotation cases in the same test file keep passing unchanged.


* Close custom-role core sessions when their tab closes, which the built-in-role cleanup loop currently leaves running.

Existing Issue: AcpSessionManager.closeTab iterates only the two built-in ACP role names, so a core session opened under a roles-file custom role survives tab close, dispose and closeAll even though the connection spec promises that closing a tab kills every core role session it holds. Severity: 5/10

Existing Risk: 5/10 - Each close of a tab that used a custom-role persona leaves that role's ACP subprocess and session holder alive, accumulating orphaned processes and stale session state across repeated tabs.

Proposal Risk: 3/10 - Iterating the tab's actual held role keys reuses the existing per-role close and delete settlement path, and the ask-and-tell close tests pin the behavior that must not move; copying the key list avoids mutation during settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "close every core role session for a tab on tab close, including custom roles". In src/acp/session-manager.ts, change AcpSessionManager.closeTab to settle and close every role currently held for the label by iterating a copy of that label's role-session map keys rather than the built-in ACP_ROLES constant, so custom roles from the roles file are also closed and their subprocesses killed; keep the per-role close, closeAll and dispose paths otherwise unchanged. Because the close settlement callback deletes entries from the map through deleteSession, iterate a snapshot of the keys to avoid skipping roles. In src/acp/manager.test.ts, extend the existing closeAll coverage with a custom-role session and assert that closing the tab closes both the custom role and the built-in roles, while the existing closeAll, cancellation and role-state tests keep passing untouched. Cross-check the lifecycle claim in product/specs/connection.md that closing a tab kills every core role session.
