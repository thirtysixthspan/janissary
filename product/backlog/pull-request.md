<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the shared-role respawn repair's no-second-priming behavior when a monitor re-binds to a live shared session.

Existing Issue: The coordinate-shared-role-session-respawn fix plan promises that when a sibling monitor still holds a live role session, respawnMonitorSession re-binds and returns with no second priming, but it always calls openMonitorSession, which posts the full persona body, suggestion format, and trust framing again to that shared session. Severity: 5/10

Existing Risk: 4/10 - Each prompt error on one of several monitors sharing a role duplicates the priming instructions into the shared conversation, growing its context and degrading suggestions for every monitor on that role.

Proposal Risk: 2/10 - A guarded early re-bind leaves the already-covered close, kill, and adopt-by-sibling paths intact; the existing tests pin re-binding and no-kill but do not yet assert the absence of re-priming.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "make a shared-role monitor respawn re-bind without re-priming". In src/monitor/session.ts, in respawnMonitorSession, when keepShared is true — a sibling exists on the same owner and role and the persona role slot still holds a session — set reg.session from the existing slot via existingPersonaRoleRuntime/tabRuntime and return before calling openMonitorSession, so no priming prompt is posted; keep the per-registration contextBytes/contextText reset at the top and leave the not-kept close/kill then openMonitorSession then sibling re-point path unchanged. In src/monitor/session.test.ts, add an assertion that this re-bind path does not call promptPersonaRole again and that reg.session is the existing shared session; keep the close/reset/re-prime test there and the shared-role respawn and re-bind tests in src/monitor/manager.test.ts passing unchanged. The "Role-backed sessions" paragraph in product/specs/monitoring.md already describes re-binding without closing, so confirm its wording still matches after the guard and only touch it if it does not.


* Correct the pull request description's Screenshots reason that still claims the editor connection row shows its model.

Existing Issue: The Screenshots paragraph names "the role-backed ACP connection row and its model in the editor's connections window" as a user-visible effect, while the corrected Behavior examples and verify steps 1 and 2 state the row is plain text labelled <persona> (acp) with no model id and that the model must be read from server-side records. Severity: 3/10

Existing Risk: 2/10 - A verifier expects a model id in the connection row, cannot find it, and discounts an otherwise accurate description of the corrected connection-row behavior.

Proposal Risk: 1/10 - The change is description prose only, and the plain-text row label is pinned by an existing test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct the Screenshots reason's claim that the editor connection row shows its model". Rewrite only the Screenshots reason sentence in the pull request body so it names the role-backed connection row labelled <persona> (acp) and the notification lines, and either drops "and its model in the editor's connections window" or points the reader at the monitor connection-info line in src/monitor/session.ts or the connection record for the model, matching the corrected Behavior examples and verify steps 1 and 2. Leave the title, the corrected monitor tool-loop "What" sentence, the Behavior examples, How to verify, and every other section byte-for-byte unchanged; apply the full revised body with gh pr edit --body-file and leave the pull request open. src/editor/acp-manager.test.ts already pins the row text and needs no change.
