<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Accept custom role names in the core client RPC decoders so custom-role connection rows can open their transcripts and records.

Existing Issue: The core RPC params decoders still admit only `ask` and `tell` for tab-scoped ACP references in `openAcpTranscript` and `openConnectionRecord`, while the connection catalog now emits rows carrying roles from the roles file, so those rows fail param validation before reaching the controller. Severity: 7/10

Existing Risk: 6/10 - A user clicks the transcript snapshot or row on a custom-role core connection and the call is rejected, leaving the newly advertised custom-role path unable to inspect its own session while the other three validation surfaces already accept the role.

Proposal Risk: 2/10 - The decoders then match the guards the pull request already widened, so the only remaining risk is admitting a malformed non-empty role, which a trimmed non-empty check and the existing param tests cover.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "accept custom role names in the core client RPC decoders". In src/client-params/core.ts, replace the `isOneOf(value.role, ACP_ROLES)` check inside `isAcpRef` and the same check in the `openConnectionRecord` decoder with a trimmed non-empty string check, matching the widening already made in src/plugins/connections/shared.ts, src/plugins/shell/shared.ts and src/acp-records/validation.ts; drop the now-unused ACP_ROLES import and update the comment that still names an editor scope. Add cases to src/client-params/core.test.ts proving a tab-scoped acpRef with a roles-file role name is accepted and an empty or whitespace-only one is refused for both openAcpTranscript and openConnectionRecord. The custom-role row emission pinned in src/connection/catalog.test.ts must keep passing.


* Ignore a monitor flush reply that settles after a reset instead of delivering a stale suggestion and dropping the re-primed first prompt.

Existing Issue: LiveMonitors.flush guards failed results with `generation === reg.resetGeneration` but its success path has no such guard, so a reply landing after resetContext has closed the core session and re-set firstPrompt still clears firstPrompt, records the reply and delivers a suggestion. Severity: 6/10

Existing Risk: 5/10 - A reset clicked as a flush completes shows a suggestion from the discarded context and leaves the next flush without the persona primer, so the fresh context silently loses its instructions until another reset.

Proposal Risk: 2/10 - Adding the same generation check to the success branch only discards results the reset already invalidated, and the existing inFlight clearing and isCurrent checks stay intact for every other path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "ignore a stale monitor flush success after a reset". In src/monitor/live-monitors.ts, inside the `flush` promise's success handler, after the isCurrent check and clearing inFlight, compare the captured `generation` with `reg.resetGeneration` before any of `reg.firstPrompt = ''`, `recordReply`, `parseSuggestion` or `deliver`, returning early when they differ; leave the failure branch's existing suppression untouched. Add a test to src/monitor/manager.test.ts that settles a flush with a successful suggestion after resetContext and asserts no suggestion is delivered, the snapshot still contains the re-primed first prompt, and the next flush carries that primer. product/specs/monitoring.md already promises a late reply after reset is ignored and delivers no suggestion, so no spec edit is needed; keep its existing stop and reset tests passing.


* Correct the pull request title that labels this feature implementation as a documentation change.

Existing Issue: The pull request is titled "docs: publish the ai-personas role and ACP pipeline plans" while the diff implements the persona-format and ACP-pipeline feature across source, tests and specs, with the plan only moved from ready to complete. Severity: 3/10

Existing Risk: 3/10 - A reviewer filtering by change type or release tooling treating the `docs` prefix as authoritative will classify a behavior-changing feature as documentation and ship it without the scrutiny a feature change gets.

Proposal Risk: 1/10 - Retitling changes metadata only and leaves the branch, commits and description untouched, so there is no code path to regress.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "correct the pull request title to describe the feature". Retitle the pull request with a `feat` conventional-commit type that names the delivered behavior, for example "feat: specify AI personas by role and route persona queries through the core ACP pipeline", so the title agrees with the feature description already in the pull request body. Do not change the description text or any source file in this work item.


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
