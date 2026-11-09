<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the unused `hasHelpFallback` export, whose result no caller reads and whose meaning differs from the dispatch policy's help check.

Existing Issue: `src/application-commands.ts` exports `hasHelpFallback`, but no production or test code calls it, and it returns true for any input except the empty string, including unknown commands, while the actual help gate in `src/native-commands/dispatch-policy.ts` checks `getOutput(commandText).kind === 'output'`; the dead export also keeps a `getOutput` import in the inventory module. Severity: 2/10

Existing Risk: 2/10 - A future caller can wire the helper into a policy path expecting a help-only answer and get a true result for unknown commands, and the unused import keeps the inventory coupled to the help reader.

Proposal Risk: 1/10 - The dead path is gone; the dispatch policy's help check is unchanged and still covered by `src/command/manager.test.ts`.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "remove the unused hasHelpFallback export". Delete `hasHelpFallback` from `src/application-commands.ts` and remove the now-unused `getOutput` import from `./commands.js`. Keep the help row's inventory data and the `getOutput(...).kind === 'output'` gate in `src/native-commands/dispatch-policy.ts` exactly as they are; that gate is what preserves bare and named help and the unknown-command reply. Confirm `grep -r hasHelpFallback` finds no references, and keep `src/application-commands.test.ts` and `src/command/manager.test.ts` passing unchanged. No new test is needed because the function has no behavior to preserve.


* Correct the pull request title, which labels the feature implementation as a documentation-only plan decomposition.

Existing Issue: The pull request title reads `docs(commands): decompose native command controls plan`, while the body and the diff implement native application command controls across server, client, and ACP code, so the title misstates the change a reviewer and a changelog will see. Severity: 3/10

Existing Risk: 3/10 - Conventional-commit tooling and release notes classify a feature as documentation, and a reader scanning history cannot find when the feature shipped.

Proposal Risk: 1/10 - The title matches the change; the body and the branch stay untouched.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "retitle the pull request to match the feature implementation". Change the pull request title to a Conventional Commits feature title such as `feat(commands): add native application command controls`. Leave the body, the branch, and every file untouched; the body's Summary and How to verify sections already describe the shipped behavior. No source, test, plan, or documentation change is needed, and the existing title is the only stale metadata.
