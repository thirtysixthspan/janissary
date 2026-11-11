<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Rename the tool-table test that still claims to list only enabled commands, now that the table reads no settings and the case only echoes an explicit allow-list.

Existing Issue: The tool-table case "keeps every included group primer while listing only enabled commands" lost its settings fixture in this change and now passes a hand-picked allow-list straight to toolPrimer, so its name claims enablement filtering that the case no longer exercises and that now lives in runCorePrompt. Severity: 2/10

Existing Risk: 2/10 - A later reader trusts the name, believes the tool table filters by enablement, and either skips adding a run-prompt test for an allow-list change or reintroduces settings reads into the pure table to make the name true.

Proposal Risk: 1/10 - Only a test title changes; if the rename were wrong, the remaining risk is that the run-prompt allow-list cases stop being the obvious home for that rule, which a search for "allow-list" across the server tests would show.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "rename the tool-table test that claims to list only enabled commands". In src/acp/tool-table.test.ts, inside describe('createAcpToolTable'), rename the case "keeps every included group primer while listing only enabled commands" to a title that states what it checks, such as "keeps every included group primer while listing only the given allow-list", and leave its body and assertions unchanged. Do not add settings back to src/acp/tool-table.ts or its test: the table is deliberately settings-free after subplan 8, and enablement filtering of the allow-list is covered in src/acp/run-prompt.test.ts by "excludes an agent-off command from the allow-list but keeps its owner primer", "keeps the group primer alone when the %s intersection is empty", and "applies an agent-access change from the next prompt, not mid-prompt", which must keep passing untouched. Verify with $janissary/scripts/run.mjs check-diff.
