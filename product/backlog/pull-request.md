<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the verification claim that an editor persona query can be closed through a core row Close control.

Existing Issue: The description's How to verify step 3 and Verification step 3 offer "press the core row's Close control" as an alternative to `connections close`, but the editor connections panel no longer supplies onCloseRow or canCloseRow, so no row in that window renders a close control. Severity: 3/10

Existing Risk: 3/10 - A verifier following the stated steps looks for a control that does not exist on the editor tab they were told to open, concludes the feature is broken, or dismisses the row through an unrelated surface without realizing the panel is intentionally read-only.

Proposal Risk: 1/10 - Rewording the two steps to name only the command path removes an unachievable instruction and leaves the delivered read-only panel and the working command unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "remove the editor close-control claim from the verification steps". Edit the pull request description's How to verify step 3 and Verification step 3 to describe closing through `connections close acp:<role>:<provider/model>` only, and add a sentence stating that the editor connections window is read-only for core rows, pointing at the removal of onCloseRow and canCloseRow in web/src/editor/EditorConnectionsPanel.tsx and web/src/editor/useEditorConnections.ts as proof. Leave code and product specs unchanged; no behavior change is proposed.


* Refresh the monitor stop test fixture to the delivered Persona shape.

Existing Issue: The `makeMonitor` fixture in src/monitor/stop.test.ts still builds a persona with the removed `harness` and `tools` fields and no `role`, relying on test files being excluded from typechecking to keep the stale shape silent. Severity: 2/10

Existing Risk: 2/10 - The fixture quietly encodes a persona shape the code no longer produces, so a future test that reads persona.role from a stopped monitor gets undefined and the mismatch surfaces as a confusing runtime failure rather than a type error.

Proposal Risk: 1/10 - Updating a single test fixture to `{ name, role, body }` mirrors the shape already used in the other monitor tests and cannot change production behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "refresh the monitor stop fixture to the delivered Persona shape". In src/monitor/stop.test.ts, change the `persona` object inside `makeMonitor` from the old harness/tools form to `{ name: 'reviewer', role: 'ask', body: '' }` so it satisfies the current `Persona` type used by MonitorSub, and keep the `satisfies MonitorSub` annotation. No production file changes; the stop and closeIfUnfed tests in that file must keep passing untouched.
