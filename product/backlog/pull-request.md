<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share one effective-setting lookup for a resolved command so dispatch policy, the ACP runner, and the ACP allow-list stop each re-finding the row in the settings snapshot.

Existing Issue: `src/native-commands/policy.ts`, `src/acp/tool-table.ts`, and `src/acp/run-prompt.ts` each independently search `snapshot.commands` by row name to read `effectiveEnabled` or `effectiveAgentAccess`, with their own missing-row defaults, so the rule that a missing manager or row means enabled is restated three times instead of living in one helper. Severity: 3/10

Existing Risk: 3/10 - A future change to the missing-row or shared-name rule must be repeated in three places, and a miss would make human dispatch, ACP execution, and the ACP primer disagree about whether a command is available.

Proposal Risk: 2/10 - Centralizing the lookup could change a default if the three current fallbacks differ subtly, which the existing policy, tool-table, and run-prompt tests would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "extract a shared effective command setting lookup". Add a small helper in `src/native-commands/policy.ts` that takes the optional snapshot and a canonical row name and returns the effective enabled and agent-access values with the enabled defaults for a missing snapshot or row. Use it in `disabledApplicationCommand` in the same file, in `toolRunner` in `src/acp/tool-table.ts`, and in the `allowedCommands` filter in `src/acp/run-prompt.ts`. Behavior must not change: `src/acp/tool-table.test.ts`, `src/acp/run-prompt.test.ts`, `src/native-commands/manager.test.ts`, and `src/native-commands/feature.integration.test.ts` already cover refusal, agent-access denial, and the allow-list and must pass untouched; add a unit test for the helper's missing-snapshot and missing-row defaults.
