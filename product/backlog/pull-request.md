<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's Screenshots reason that still claims the editor connection row shows its model.

Existing Issue: The Screenshots paragraph names "the role-backed ACP connection row and its model in the editor's connections window" as a user-visible effect, while the corrected Behavior examples and verify steps 1 and 2 state the row is plain text labelled <persona> (acp) with no model id and that the model must be read from server-side records. Severity: 3/10

Existing Risk: 2/10 - A verifier expects a model id in the connection row, cannot find it, and discounts an otherwise accurate description of the corrected connection-row behavior.

Proposal Risk: 1/10 - The change is description prose only, and the plain-text row label is pinned by an existing test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct the Screenshots reason's claim that the editor connection row shows its model". Rewrite only the Screenshots reason sentence in the pull request body so it names the role-backed connection row labelled <persona> (acp) and the notification lines, and either drops "and its model in the editor's connections window" or points the reader at the monitor connection-info line in src/monitor/session.ts or the connection record for the model, matching the corrected Behavior examples and verify steps 1 and 2. Leave the title, the corrected monitor tool-loop "What" sentence, the Behavior examples, How to verify, and every other section byte-for-byte unchanged; apply the full revised body with gh pr edit --body-file and leave the pull request open. src/editor/acp-manager.test.ts already pins the row text and needs no change.
