<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Fix the Commands tab's duplicate row keys and accessible names for the builtin `question` row and the native `question ask` row.

Existing Issue: The tab keys each row by its display label and uses that label in the checkbox names, but the builtin `question` row's label is its first fixed form `question ask`, which is also the native `question ask` row's label, so two sibling rows share one React key and one accessible name. Severity: 5/10

Existing Risk: 5/10 - A repaint can make React reuse or drop one of the duplicate-keyed rows, so a toggle's checked state or focus can land on the wrong row, and assistive technology cannot tell the two Enabled checkboxes apart.

Proposal Risk: 2/10 - The fix removes the key and name collision, but it changes the displayed label for one builtin row, so the spec and user docs must be kept in step; the settings and dispatch behavior do not move.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "disambiguate the builtin question row from the native question ask row". In `src/plugins/commands/payload.ts`, make `labelFor` consider the full row list and use the row's canonical `name` when its first form equals another row's `name` (so the builtin `question` row displays `question` while the native `question ask` row keeps `question ask`); alternatively keep the display label and make the row identity unique. In `web/src/plugins/commands/CommandsTab.tsx`, key each row by a stable pair such as `${row.name}:${row.label}` instead of `label` alone, and keep `CommandRow`'s accessible names unique for the two rows (either through the disambiguated label or an explicit suffix). Add a `web/src/plugins/commands/CommandsTab.test.tsx` case and a `src/plugins/commands/payload.test.ts` case that include the builtin `question` row and the native `question ask` row, assert both render, both Enabled toggles are addressable, and a publication updates the intended row; update `product/specs/commands-tab.md`, `help/commands.md`, and `documentation/user-documentation/tab-types/commands.md` if the displayed label changes. The existing ask/tell/search form-row rendering and repaint tests must keep passing.


* Make the Commands command grammar prefer a row's canonical name over another row's fixed form so `question ask` and `question approve` target the native commands.

Existing Issue: `parseCommand` scans rows in payload order and accepts the first row whose name, aliases, or forms match, so the builtin `question` row's fixed forms `question ask` and `question approve` win over the native rows' canonical names; `commands disable question ask` changes the builtin `question` setting and `commands disable agent question ask` is refused as non-native, while the settings manager's resolver targets the native row. Severity: 7/10

Existing Risk: 6/10 - A user disabling the native question tool can instead disable the application's `question` command and, through the parent relationship, both native question tools, while agent access for `question ask` cannot be changed from the command bar at all; the mistake is recoverable from the tab or the file but is silent.

Proposal Risk: 2/10 - The precedence becomes deterministic and matches the manager, but any overlapping form now resolves by name first, so the new tests must pin the intended winner for the question rows and keep the ask/tell/search/db cases unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "prefer canonical command names over fixed forms in the commands grammar". In `src/plugins/commands/parse-command.ts`, resolve the normalized remainder in three passes across all rows: an exact canonical `name` match, then an exact `aliases` match, then an exact `forms` match, returning the first match's `name`; do not let row order decide between a later row's name and an earlier row's form. Add `src/plugins/commands/parse-command.test.ts` cases with a builtin `question` row and native `question ask`/`question approve` rows, asserting `enable question ask` targets `question ask` and `disable agent question ask` produces the agent-access edit for `question ask`, and add an `src/plugins/commands/activate.test.ts` case asserting the sent name and setting. Keep the existing `ask reset`, `tell reset`, `search transcript`, `db sqlite`, `commands disable agent`, and `commands disable agent agent` cases passing, and update `product/specs/application-commands.md` if the precedence needs to be stated.


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
