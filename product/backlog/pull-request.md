<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that an editor persona's connection row reports the role's configured model.

Existing Issue: The behavior example and verification steps 1 and 2 say the persona row's connection string reports the role's model (`claude:claude-haiku-4-5`, `codex:gpt-6-luna`), but the code labels that row with the persona name only and names tracked records by role and owner, never by model. Severity: 6/10

Existing Risk: 5/10 - A verifier follows the "How to verify" steps, cannot find the promised model in the connections window, and reports the role-backed pipeline as broken even though it works, delaying release over a documentation mismatch.

Proposal Risk: 2/10 - The description and code agree afterwards; no runtime behavior changes, so the only remaining risk is that a later model change makes the corrected wording stale again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "correct the pull request description's editor connection-row example and verification steps". In the pull request body's "Behavior examples" block, replace the `acp:claude:claude-haiku-4-5 ... Idle` line and its "the model is the research role's configured model" comment with the row the code actually renders: the editor connections window shows `<persona> (acp)` from `connectionsFor` in `src/editor/acp-manager.ts`, carried through `src/connection/catalog.ts` and rendered as plain text in `web/src/shared/status-windows/StatusPanels.tsx`; the connections tab's tracked record name is `acp:<role>:<ownerName>` from `recordConnectionName` in `src/plugins/connections/shared.ts`. Rewrite "How to verify" steps 1 and 2 so they confirm one row per persona role and the absence of an `ask` default, and direct the model check to the monitor connection-info line in `src/monitor/session.ts` or to the connection record, as the closing paragraph of the description already does for other server-side facts. Preserve every other character of the description, including the corrected monitor tool-loop sentence and the Screenshots reason. No code, spec, or test changes: `src/editor/acp-manager.test.ts` already pins the row text.

* Stop the unbounded growth of per-slot death hooks when an editor persona is suggested repeatedly.

Existing Issue: `PersonaRoleSessionManager.session` appends a hook to an in-memory list on every call and clears it only on death or close, so every repeated suggestion on one role slot adds another closure that the death path later walks. Severity: 5/10

Existing Risk: 4/10 - A long-lived editor tab that issues many suggestions on one persona accumulates one closure per request; the list and its captured state grow without bound and every connection death walks the whole list, adding avoidable work and memory pressure to a core path.

Proposal Risk: 2/10 - The list holds one hook per live consumer after the change, so a death still reaches every monitor sharing the slot while repeated editor requests no longer add entries; the remaining risk is dropping a sibling monitor's hook, which the existing multi-consumer tests catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2170 "deduplicate per-slot persona death hooks across repeated prompts". In `src/acp/persona-role-session.ts`, give `session()` a caller identity so a second call from the same consumer replaces its hook instead of appending a new one, while distinct consumers on a shared role slot (several monitors, or a monitor and an editor persona) keep one hook each. Derive the identity from the caller context already passed into `promptPersonaRole` in `src/acp/persona-role.ts` rather than from the role alone, since two personas can declare the same role. Keep `forget()` clearing the list on close, death, tab release, and disposal, and keep the composite `state.hooks` so a connection-level death reaches every registered consumer. Verify against the multi-consumer death test in `src/acp/persona-role.test.ts`, the shared-role respawn and death tests in `src/monitor/manager.test.ts`, and the editor death-notice test in `src/editor-suggest/death-notice.test.ts`; all must keep their current single-notification assertions.
