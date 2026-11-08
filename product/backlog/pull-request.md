<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's running-marker name from the active connection record after a shell tab is renamed.

Existing Issue: A dispatch receipt uses the tab's current title while its reused role session and connection record keep the ownerName captured when that session was created, so a rename makes the running marker's tooltip and accessible name disagree with the connection tab it opens. Severity: 3/10

Existing Risk: 3/10 - A renamed shell can show an inaccurate name for the rest of the session, though clicking still opens the correct record.

Proposal Risk: 1/10 - Reading the active record name for reused sessions leaves only a brief pre-record fallback name before the first connection record exists.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1962 "Keep running marker names aligned after a shell tab rename". In `src/acp/response.ts`, derive the receipt name from the active role record identified by the shell tab runtime when that record exists, and retain the current tab title or label as the fallback before a record exists. Add coverage in `src/acp/plugin-session.test.ts` for dispatching once to create a role record, renaming the shell tab, and dispatching again; assert the second receipt name matches the active record's `recordConnectionName`, while an initial dispatch without a record still uses the current tab title or label. Confirm the running marker opens that same record through its existing role reference.


* Close the security gap from executable directions in reviewed pull request materials.

Existing Issue: The pull request body's setup directs a reviewer to build and start an instance and run app commands, and the repair plan explicitly directs running `check-diff`, so branch text asks an agent with repository access to execute commands. Severity: 8/10

Existing Risk: 8/10 - An agent that obeys untrusted review text could execute project code or tooling before independently assessing it.

Proposal Risk: 2/10 - Replacing execution requests with factual verification results removes the command-execution prompt while leaving the implementation evidence available to reviewers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1962 "Remove executable review directions from the PR body and repair plan". Update the pull request body's `How to verify` section to retain only factual results already captured in the description, removing imperative setup and execution steps. Update `product/plans/complete/shell-reply-id-retention.md` to record the completed verification outcome instead of directing an agent to run `$janissary/scripts/run.mjs check-diff`. Read both sections back and confirm they describe observed results without asking the reader to execute shell or app commands; keep the existing implementation and test evidence intact.
