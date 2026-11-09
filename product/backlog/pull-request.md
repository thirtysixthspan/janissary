<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep a user's home-level command and agent-access restrictions in force when a project commands file is present, instead of only noting that the project file lifts them.

Existing Issue: A valid project `.janissary/commands.json` replaces the home file entirely, so a cloned repository can re-enable a command or an agent's access to a native ACP command that the user restricted in `~/.janissary/commands.json`, and the only response is an informational line shown when the Commands tab is opened. Severity: 5/10

Existing Risk: 6/10 - A user who denied agents `db sqlite query` or `browser goto` at home level opens an untrusted repository whose committed file restores that access, and the agent can run the command in that project before anyone opens the Commands tab to see the notice.

Proposal Risk: 3/10 - Restrictions from the home file would always win, so a project could no longer relax them, which changes the plan's replace-entirely rule that the roles configuration also follows and needs the plan, spec and documentation updated to match.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "keep home-level command restrictions in force under a project commands.json". In `src/native-commands/settings-file.ts`, change `readCommandSettings` so that when the project file is the effective file, each command's `enabled` and `agentAccess` values are combined with the home file's values by logical AND (a restriction in either file stays), and `homeRestrictionsLifted` is retired or repurposed to report restrictions the project file attempted to lift. Mirror the same merge in `NativeCommandSettingsManager.edit` in `src/native-commands/manager.ts` so that a save to the project file does not write home restrictions into it or drop them. Update the `overridden` wording in `web/src/plugins/commands/CommandsTab.tsx` and the payload validators in `src/plugins/commands/shared.ts` and `src/plugins/commands/payload.ts` to match, and revise `product/specs/commands-tab.md`, `product/specs/application-commands.md`, `product/specs/application-config.md`, `documentation/user-documentation/tab-types/commands.md` and the plan's replacement rule so the behavior and docs agree. The existing tests in `src/native-commands/manager.test.ts`, `src/native-commands/feature.integration.test.ts` and `web/src/plugins/commands/CommandsTab.test.tsx` that assert replacement semantics and the lifted-restriction notice must be rewritten for the merged behavior, and a new test should pin that a project file cannot re-enable a home-disabled command or home-denied agent access. Whether the replacement rule should change at all is a design decision, so confirm it before implementing; if the decision is to keep replacement, record that decision in the spec as an accepted trust boundary.


* Return the Commands payload schema version to 1, the value the plan fixed for a plugin that has never shipped, or record why it moved to 2.

Existing Issue: `COMMANDS_PAYLOAD_SCHEMA_VERSION` is 2 although the plan says the Commands plugin payload schema starts at 1, and the last commit raised it when it added the optional `overridden` field without any plan, spec or description statement of the change. Severity: 2/10

Existing Risk: 2/10 - A reader checking the plugin against the plan or the plugin specification finds a version the documents do not account for, and a later schema change is numbered from a wrong baseline.

Proposal Risk: 1/10 - Nothing has been released at version 1, so the only exposure is a test pinned to the constant, which reads it by name and follows the change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "set the Commands payload schema version back to 1". Set `COMMANDS_PAYLOAD_SCHEMA_VERSION` in `src/plugins/commands/shared.ts` to 1; `src/plugins/commands/manifest.ts` and `src/plugins/commands/manifest.test.ts` already read the constant, so they follow. Run a `grep` for any literal `2` fixtures for the Commands payload version in `web/src/plugins/commands/CommandsTab.test.tsx`, `web/src/plugins/registry.test.tsx` and `src/plugins/commands/activate.test.ts` and update them. If the decision is to keep 2, instead state the version and its reason in `product/specs/commands-tab.md`.


* Describe the Commands tab's home-restrictions notice in the pull request description and give it a verification step.

Existing Issue: The description's What and How to verify sections never mention that the Commands tab shows `This project file lifts N home restriction(s): …` when a project file relaxes the home file, although the branch's last commit added it as visible behavior with a new `overridden` payload field. Severity: 3/10

Existing Risk: 3/10 - A reviewer judging the project-override behavior from the description sees a silent replacement rule and misses the one user-visible warning and its limits, such as appearing only while the tab is open.

Proposal Risk: 1/10 - Only prose changes, and the remaining risk is that the sentence drifts if the notice wording or the replacement rule later changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "describe the home-restrictions notice in the pull request description". In the description's What section, after the sentence about a project `.janissary/commands.json` replacing the home file, add a sentence stating that the Commands tab lists the commands whose home restriction a valid project file lifts. Extend edge case 9 of How to verify with a scratch home file that disables `browser content` and a project file that does not, and expect the notice line naming `browser content`. Take the wording from `web/src/plugins/commands/CommandsTab.tsx` and `product/specs/commands-tab.md`. Do not touch source or specs.


* Share one command-name normalizer and longest-form matcher between the server inventory, the settings decoder and the browser instead of keeping separate copies.

Existing Issue: The whitespace and case normalizer plus the longest-form and canonical-form tie-break matching are written out separately in `src/application-commands.ts`, `src/native-commands/decode.ts` and `web/src/shared/command-availability.ts`, so the rules for which row owns an input exist in three places. Severity: 4/10

Existing Risk: 5/10 - The plan requires the client's disabled-command match to agree with the server's resolver, and a tie-break change made in one copy would let a shortcut or command-bar line be blocked or allowed on the client while the server decides otherwise, which no test compares directly.

Proposal Risk: 3/10 - The shared module must stay import-free to remain browser-safe, so a mistake there changes server resolution and client gating together, though the existing tests on both sides would catch most mistakes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "share one command-name normalizer and form matcher across server and client". Add a pure, import-free module next to `src/shared/application-commands.ts` exporting `normalizeCommandName`, a form-boundary predicate and the longest-form and canonical-form ranking, typed over rows that carry `name`, `aliases` and `forms`. Replace the local copies in `src/application-commands.ts`, `src/native-commands/decode.ts` and `web/src/shared/command-availability.ts` with imports through the `@shared` alias, leaving `resolveApplicationCommand`'s search-owner special case on the server only. Keep `src/application-commands.test.ts`, `src/native-commands/decode.test.ts` and `web/src/shared/command-availability.test.ts` passing unchanged, and add a parity test that runs the same inputs, including `question ask`, `ask reset`, `search transcript` and `browser goto`, through the server resolver and the client matcher.
