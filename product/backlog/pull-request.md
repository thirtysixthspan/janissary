<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's verification step 7 claim that an editor persona's connection reports a model id.

Existing Issue: How to verify step 7 expects the editor persona suggestion's connection to report `claude:claude-haiku-4-5`, while the editor connections window renders only the plain-text row `<persona> (acp)` with no model id and the description's own Behavior examples, Screenshots reason, and verify steps 1 and 2 state the model is a server-side fact to read from the monitor connection-info line or the connection record. Severity: 3/10

Existing Risk: 4/10 - A verifier following step 7 looks for a model id in the editor connection row, never finds it, and concludes the role-backed session is not bound to the declared model or that the feature is broken.

Proposal Risk: 2/10 - The description then agrees with the row and record shapes the code already produces, leaving only the server-side model check the other sections already describe.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct verification step 7's stale editor connection model claim". In the pull request description's "How to verify" section, rewrite step 7 ("Role names resolve trimmed and case-insensitively") so it no longer expects the editor persona's connection to report `claude:claude-haiku-4-5`: keep the expectation that the request runs on the same `research` role and that surrounding spaces and different case do not create an unknown-role notification, and direct any model check to the monitor connection-info line in src/monitor/session.ts or to the connection record, exactly as verify steps 1 and 2 and the Screenshots section already do. Read the current body with gh pr view 2170 --json body, change only that step's Expect line, write the full body to a scratch file, and apply it with gh pr edit 2170 --body-file, leaving the title and every other section untouched and the pull request open. Confirm the row text against connectionsFor in src/editor/acp-manager.ts, which builds `${persona} (acp)`, its carry-through in src/connection/catalog.ts, and its plain-text render in web/src/shared/status-windows/StatusPanels.tsx; src/editor/acp-manager.test.ts already pins that text and must keep passing. Do not change any source, test, spec, help, or user-documentation file for this description fix.
