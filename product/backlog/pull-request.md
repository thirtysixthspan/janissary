<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the running marker name aligned if model fallback changes the active role record.

Existing Issue: A dispatch receipt captures the old active record's name before a prompt starts, but a model fallback can close that record and create a new one using the renamed shell title while the running marker retains its original name and opens the new record through its role reference. Severity: 3/10

Existing Risk: 3/10 - During a fallback prompt, the marker's tooltip and accessible name can disagree with the record its role reference opens.

Proposal Risk: 1/10 - Refreshing the pending marker name when fallback changes the role record would leave the mismatch only in the brief period before that record change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1962 "keep running marker names aligned after model fallback changes the active record". In `src/acp/response.ts` and the shell dispatch flow, preserve the receipt's correlation to the pending prompt while exposing the new record name when `AcpManager` closes a failed record and begins its fallback record. Update `web/src/plugins/shell/useShellReplyWriters.ts` to refresh the pending marker's name without changing its role reference, which must continue to open the role's current record. Cover a renamed shell whose current model fails and whose fallback creates a record with the new owner name in `src/acp/plugin-session.test.ts`, and cover updating the already-running marker's tooltip and accessible name in `web/src/plugins/shell/useShellReplyWriters.test.ts`; also keep the initial no-record title-or-label fallback and normal reused-record path covered.
