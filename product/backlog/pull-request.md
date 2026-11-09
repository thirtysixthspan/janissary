<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the self-disabled native row's disabled Agent access toggle in the Commands tab test.

Existing Issue: The test named for a self-disabled row uses the non-native `db` row, so it asserts that Enabled stays interactive but never asserts that a self-disabled native row's Agent access checkbox is disabled; the plan's named scenario is only half covered. Severity: 3/10

Existing Risk: 3/10 - A regression in `isAgentAccessDisabled`'s `!effectiveEnabled` branch could let a self-disabled native row grant agent access without a failing test.

Proposal Risk: 1/10 - Adding assertions pins behavior that already exists; the only risk is choosing a fixture row whose parent state accidentally changes the expectation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "cover the self-disabled native row's disabled Agent access toggle". In `web/src/plugins/commands/CommandsTab.test.tsx`, extend the self-disabled test or add a sibling that uses a native row with `enabled: false`, `effectiveEnabled: false`, `agentAccess: true`, `effectiveAgentAccess: false`, and no disabled parent (the existing `browser eval` fixture row fits), asserting `Enabled: <label>` is enabled and unchecked while `Agent access: <label>` is disabled and checked; keep the existing non-native `db` assertion if it still adds value. This pins the `!effectiveEnabled` branch in `isAgentAccessDisabled` from `web/src/plugins/commands/commands-keys.ts`; the existing parent-disabled and agent-denied tests must keep passing.


* Skip pending-disabled toggles during Commands tab keyboard navigation.

Existing Issue: `moveCommandFocus` only knows the static parent and agent disabled states, not the pending set, so while a save is in flight an Up or Down can target a checkbox disabled by `enabledPending` or `agentPending`; `focus()` on a disabled input does nothing, leaving focus where it was instead of falling back or skipping. Severity: 3/10

Existing Risk: 3/10 - A user navigating immediately after a toggle can get stuck on a row until the save completes; the window is short and recoverable, but the keyboard contract the plan promises is not honored.

Proposal Risk: 1/10 - Threading the pending predicate into the helper is contained, and the existing static disabled tests continue to cover the other branches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "skip pending-disabled toggles during Commands tab keyboard navigation". Change `moveCommandFocus` in `web/src/plugins/commands/commands-keys.ts` to accept an `isToggleDisabled(row, column)` predicate (or the pending set plus a helper) and have `targetColumn` treat a pending-disabled matching toggle as disabled: fall back to that row's Enabled toggle when the matching toggle is pending-disabled and Enabled is not, and skip the row when Enabled is also disabled. In `web/src/plugins/commands/CommandsTab.tsx`, pass `isPending` from `useCommands` into the helper. Add `web/src/plugins/commands/commands-keys.test.ts` cases for a pending-enabled row and a pending-agent row, and a `web/src/plugins/commands/CommandsTab.test.tsx` case that clicks a toggle, presses ArrowDown/ArrowUp while the deferred save is pending, and asserts focus lands on the fallback or skips the row; keep the existing static disabled navigation tests passing.


* Add colocated coverage for the commands payload mapping and topic-data validation.

Existing Issue: `src/plugins/commands/payload.ts` is the only new server module without a colocated test, and its mapping edge cases — parent canonicalization, dropping a parent equal to the name, keeping an unmatched parent, label selection, and optional fields — are only partially exercised through `activate.test.ts`. Severity: 3/10

Existing Risk: 3/10 - A regression in the mapping or validation can ship a wrong parent, label, or malformed payload; the host payload guard catches some shapes but not a wrong parent or label, and the activate tests do not cover the drop/keep rules.

Proposal Risk: 1/10 - A focused test file pins the current transformation without changing production behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "add colocated coverage for the commands payload mapping and validation". Add `src/plugins/commands/payload.test.ts` covering `isCommandsData` accepting a complete snapshot and an empty command list and rejecting null, arrays, missing or mistyped `commands`, `name`, `kind`, `aliases`, `forms`, `parent`, `nativeTool`, the four flags, `source`, `path`, and `problem`; cover `toPayload` mapping rows in order with `label` equal to `name` when `forms` contains `name` and to the first form otherwise, parent canonicalized through a name, alias, and form, an unmatched parent kept, a parent equal to the row's name dropped, and optional `nativeTool`, `problem`, `source`, and `path` preserved. Use a fixture that includes the ask/tell/search form rows and a native child row; the existing `src/plugins/commands/activate.test.ts` mapping assertions must keep passing.


* Correct the spec's claim that `commands disable agent agent` changes agent access for `agent`.

Existing Issue: `product/specs/application-commands.md` says `commands disable agent agent` changes agent access for `agent`, but the topic refuses that edit with `Not a native ACP command: agent.` because `agent` is not native; the plan's test and the implementation both expect the refusal. Severity: 2/10

Existing Risk: 2/10 - A reader or future implementer may expect the change to succeed and treat the refusal as a bug, or document the wrong behavior onward.

Proposal Risk: 1/10 - A one-sentence spec correction changes no code.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "correct the spec's claim that commands disable agent agent changes agent access". In `product/specs/application-commands.md`, rewrite the sentence to say `commands disable agent agent` is parsed as an agent-access change for `agent` and is then refused with `Not a native ACP command: agent.` because `agent` is not a native ACP command; keep the `commands disable agent` example and the exact-error paragraph. Check `help/commands.md`, `documentation/user-documentation/tab-types/commands.md`, and `documentation/user-documentation/command-bar/commands.md` for the same example; they do not state the false success, so leave them unchanged unless the wording implies it. No code or test change is needed.


* Share the commands domain source and native-tool sets between the payload validator and the shared contract instead of duplicating them.

Existing Issue: `src/plugins/commands/payload.ts` redefines the `SOURCES` and `NATIVE_TOOLS` sets and the `isRecord` guard that already exist in `src/plugins/commands/shared.ts`, so the two validators can drift when the domain changes. Severity: 2/10

Existing Risk: 2/10 - Adding a source or native tool to one module but not the other can make the topic validator reject a valid snapshot or accept an invalid one while the client guard disagrees.

Proposal Risk: 1/10 - Exporting the existing sets and helper from the import-free shared contract and importing them in the payload validator keeps one definition; the client chunk already carries them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "share the commands domain sets between the payload validator and the shared contract". In `src/plugins/commands/shared.ts`, export the existing `SOURCES`, `NATIVE_TOOLS`, and `isRecord` without adding imports so the contract stays import-free; in `src/plugins/commands/payload.ts`, import those values from `./shared.js` instead of redefining them, leaving the payload-specific `KINDS`, `isStringList`, and shape checks local. Keep `isCommandsPayload`, `isSetIntent`, `isCommandsData`, and `toPayload` behavior unchanged, and run the existing shared and activate tests; add a payload test only if the sharing changes a branch.
