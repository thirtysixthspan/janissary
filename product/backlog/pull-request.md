<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the harness-view comment claiming the connections panel and sessions row show the saved host name in place of the real destination.

Existing Issue: The new hostName field's comment says the connections panel and sessions row display the saved name instead of the raw destination, but the panel renders the real [user@]host from HarnessView.destination and no view reads hostName. Severity: 2/10

Existing Risk: 3/10 - A maintainer trusting the comment wires hostName into the connections row, contradicting the spec's explicit statement that the panel keeps showing ssh:<destination> with the real host.

Proposal Risk: 1/10 - The comment then describes the field as data carried for later views and no code changes, leaving only the residual risk that a future view consumes it without updating the spec.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2092 "correct the hostName field comment about panel display". In src/tab/types.ts, rewrite the hostName comment on HarnessView to say the field is set only on ssh tabs opened from a saved host and carries the stored name for later views, while the connections panel continues to show ssh:<destination> from HarnessView.destination as built in src/connection/catalog.ts (sshEntry). Do not add rendering code — Sessions column work is out of scope for the plan this commit implements. No test change is needed; the existing src/ssh-manager.test.ts assertions that destination stays the real host and hostName carries the saved spelling must keep passing.
