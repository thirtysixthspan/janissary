<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the fallback problem line visible after a successful commands edit instead of dropping it from the published snapshot.

Existing Issue: When the project `commands.json` is unusable and the home file is in effect, `refresh` publishes a snapshot with the `showing the home commands file` problem, but a later successful `edit` publishes a snapshot built without any `problem`, so the Commands tab stops reporting a damaged project file that still exists and is still being ignored. Severity: 3/10

Existing Risk: 3/10 - A user who sees the warning, toggles a setting, and no longer sees it can assume the project override is healthy and be confused when the damaged file keeps being ignored.

Proposal Risk: 2/10 - The edit path would carry the problem text from its fresh read, so the only new risk is a stale warning if the project file is repaired between the read and the publish, which the next refresh corrects.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "preserve the fallback problem in the snapshot published after a commands edit". In `src/native-commands/manager.ts` `edit`, pass `read.problem` through to the `createSnapshot` call when the read came from a fallback (source `home` or `project` with a defined problem) so the published snapshot matches what `refresh` would publish. Add a case in `src/native-commands/manager.test.ts` with a malformed project file and a valid home file, performing an edit, and asserting the published snapshot still carries the problem and names the home path as the edit destination. Keep the existing first-write, failed-write, and unusable-file tests passing unchanged.


* Make the Roles tab handle invalid commands topic data the same way on every path instead of failing on open and silently dropping restrictions on repaint.

Existing Issue: In `src/plugins/roles/activate.ts`, opening the tab reports `invalid commands topic data` when `commandRestrictionsFrom` returns undefined, while `publish` replaces the same undefined result with an empty restriction map, so a malformed topic snapshot yields an open failure in one path and a silently unrestricted display in the other. Severity: 3/10

Existing Risk: 3/10 - After a malformed commands notification, Roles repaints with no dimming, so a disabled or agent-denied grant looks fully available while the tab shows no sign that the data was refused.

Proposal Risk: 2/10 - Reporting a failure on repaint could disable the Roles plugin for a transient bad snapshot, so the choice between failure and keeping the previous restrictions must be made deliberately and covered by a test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "treat invalid commands topic data consistently in the Roles plugin". In `src/plugins/roles/activate.ts`, change `publish` to follow the same rule as `command`: when `commandRestrictionsFrom(capabilities.topicData('commands'))` is undefined, call `capabilities.reportFailure` with the existing `invalid commands topic data` text and skip the update instead of publishing an empty map, or keep the last published restrictions if the plugin must stay usable; pick one and state it in `product/specs/roles.md`. Add cases to `src/plugins/roles/activate.test.ts` for malformed data on notify and on open, and keep the existing restriction-mapping, picker, and grant tests in `src/plugins/roles/command-policy.test.ts` and `RolesTab.test.tsx` passing unchanged.


* Share one effective-setting lookup for a resolved command so dispatch policy, the ACP runner, and the ACP allow-list stop each re-finding the row in the settings snapshot.

Existing Issue: `src/native-commands/policy.ts`, `src/acp/tool-table.ts`, and `src/acp/run-prompt.ts` each independently search `snapshot.commands` by row name to read `effectiveEnabled` or `effectiveAgentAccess`, with their own missing-row defaults, so the rule that a missing manager or row means enabled is restated three times instead of living in one helper. Severity: 3/10

Existing Risk: 3/10 - A future change to the missing-row or shared-name rule must be repeated in three places, and a miss would make human dispatch, ACP execution, and the ACP primer disagree about whether a command is available.

Proposal Risk: 2/10 - Centralizing the lookup could change a default if the three current fallbacks differ subtly, which the existing policy, tool-table, and run-prompt tests would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "extract a shared effective command setting lookup". Add a small helper in `src/native-commands/policy.ts` that takes the optional snapshot and a canonical row name and returns the effective enabled and agent-access values with the enabled defaults for a missing snapshot or row. Use it in `disabledApplicationCommand` in the same file, in `toolRunner` in `src/acp/tool-table.ts`, and in the `allowedCommands` filter in `src/acp/run-prompt.ts`. Behavior must not change: `src/acp/tool-table.test.ts`, `src/acp/run-prompt.test.ts`, `src/native-commands/manager.test.ts`, and `src/native-commands/feature.integration.test.ts` already cover refusal, agent-access denial, and the allow-list and must pass untouched; add a unit test for the helper's missing-snapshot and missing-row defaults.
