<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Derive plugin inventory rows from the plugin commands the adapter accepted, not from every registered command name, and pin the rejected-claim case with a test.

Existing Issue: `listApplicationCommands` in `src/application-commands.ts` decides a bundled plugin declaration was accepted by checking `registeredNames`, which is the union of core and plugin command names, so a declaration whose command or alias claims a reserved core name such as `open` is rejected by `createPluginCommands` yet still adds a plugin row or alias because the core command keeps that name in the set; no bundled plugin claims a reserved name today and no test covers the case. Severity: 4/10

Existing Risk: 4/10 - A future bundled plugin that claims a reserved name would show a phantom plugin row whose toggle actually changes the core command's setting, contradicting the plan's promise that rejected plugin claims never enter the inventory.

Proposal Risk: 1/10 - The inventory shows only accepted claims and the core commands are untouched; a rejected declaration contributes nothing.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "derive plugin inventory rows from accepted plugin claims". In `src/application-commands.ts`, stop using the union of all command names as the acceptance test. Expose the per-declaration accepted command and alias names from `createPluginCommands` in `src/plugins/command-adapter.ts` (for example a map keyed by declaration id, or a small result object that the inventory reads) and have `listApplicationCommands` build plugin rows from those accepted names only; a rejected command or alias must contribute nothing even when its text matches a core command. Keep the existing row shape, aliases, and alphabetical ordering. Add a colocated test, in a separate file if needed so `vi.mock('./plugins/catalog.js')` does not disturb the existing module-level rows, that mocks `tabPluginCatalog` with a declaration claiming a reserved core name such as `open`, asserts no `kind: 'plugin'` row or alias appears for it, and asserts an accepted declaration still contributes its row and aliases; clear the contribution-rejection registry in `afterEach` as `src/plugins/adapters.test.ts` does. Also assert every `coreCommands` entry has exactly one inventory row (the builtin `shell` represented by the plugin row), and that `help` and all nine `NATIVE_ACP_COMMANDS` rows are present, so the plan's completeness guarantee is pinned.


* Disable the Agent access checkbox and show the parent note when a parent denies agent access even if the child's own saved agent access is already off.

Existing Issue: `isAgentAccessDisabled` in `web/src/plugins/commands/commands-keys.ts` treats a parent denial as present only when `row.agentAccess && !row.effectiveAgentAccess`, and `CommandRow.tsx` computes its note the same way, so a native child whose own saved `agentAccess` is false and whose parent denies agent access keeps an interactive checkbox and no `Disabled by parent command` note instead of the disabled checkbox and note the plan describes. Severity: 2/10

Existing Risk: 2/10 - The tab offers a toggle that cannot change the effective state and hides the reason, inviting repeated saves that appear to do nothing; the shape is not reachable with today's native vocabulary because no native command has a native parent, so the impact waits for a future inventory change.

Proposal Risk: 1/10 - The checkbox and note follow the documented parent rule, the saved value is unchanged, and no server behavior moves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "disable the Agent access checkbox when a parent denies agent access". In `web/src/plugins/commands/commands-keys.ts`, replace the own-value inference in `isAgentAccessDisabled` with a parent lookup: resolve `row.parent` in `rows` and treat the toggle as disabled when that parent row is effectively enabled but its `effectiveAgentAccess` is false, while leaving a child whose own `agentAccess` is false interactive when the parent allows it. In `web/src/plugins/commands/CommandRow.tsx`, compute the same parent-denial condition for the `Disabled by parent command: <parent>.` note so the note and the disabled checkbox agree; keep the row undimmed and keep the saved value unchanged. Add cases to `web/src/plugins/commands/commands-keys.test.ts` and `web/src/plugins/commands/CommandsTab.test.tsx` covering a native child with `agentAccess: false`, `effectiveAgentAccess: false`, and a parent whose `effectiveAgentAccess` is false, asserting the checkbox is disabled and the note appears, plus the existing own-off/parent-allows case staying interactive. Keep `isParentDisabled`, the native-only checkbox rendering, and the existing parent-disabled tests unchanged.


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
