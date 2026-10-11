<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle failed roles writes without corrupting the last valid configuration.

Existing Issue: The roles writer truncates the destination before writing and catches failures afterward, so a refused edit can leave partial JSON on disk while the tab continues showing the previous configuration. Severity: 8/10

Existing Risk: 6/10 - A disk write failure or interrupted process destroys role descriptions and model choices in the shared home file or project override, requiring manual recovery.

Proposal Risk: 2/10 - Replacing the destination atomically preserves its prior contents on ordinary write failures, although replacement errors and filesystem durability still require explicit failure coverage.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "preserve the existing roles configuration when a write fails". Publish a narrow atomic configuration writer through src/plugins/files.ts using the existing src/atomic-write.ts implementation, so src/plugins/roles/roles-file.ts can use it without crossing the concrete plugin import boundary. Keep writeRolesFile's boolean success contract, directory creation, destination permissions, and the activation's existing refusal wording and unchanged-payload behavior. Extend src/plugins/roles/roles-file.test.ts with a failure after partial temporary output and a failed replacement, asserting that the original destination bytes survive and temporary files are removed; its current directory-as-destination test never reaches truncation of a valid file. Extend src/plugins/roles/activate.test.ts to verify that a failed edit rejects, publishes no replacement payload, and leaves the original roles readable. Preserve existing home/project precedence, partial-damage refusal, successful round trips, and launcher reader behavior.


* Handle accepted special and numeric role names without losing roles or changing their order during file round trips.

Existing Issue: Persisting an accepted __proto__ role invokes the ordinary object's inherited setter and omits that role, while integer role names are reordered numerically by both object serialization and parsed-object enumeration. Severity: 8/10

Existing Risk: 5/10 - Renaming a populated role to __proto__ silently deletes its stored choices, and numeric names make successful add or reorder operations publish a different order from the one requested.

Proposal Risk: 2/10 - Preserving textual member order avoids ordinary-object property semantics, but JSON escaping and nested values must remain correctly decoded to prevent a new parsing error.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "preserve accepted role names and role order through JSON round trips". Replace the ordinary-object accumulation in src/plugins/roles/roles-file.ts with an ordered keyed-object serializer that JSON-encodes each role name and value independently, preserving __proto__ as an ordinary own member and retaining the supplied list order. Preserve textual top-level member order when reading as well, because Object.entries on JSON.parse's result sorts integer keys even when the file text has the intended order; add a focused pure helper under src/plugins/roles/ and, if necessary, extend readJsonConfigFile in src/plugins/files.ts to pass the already-read source text to the decoder while leaving launcher semantics unchanged. Retain the agreed object keyed by role name, unrestricted nonempty trimmed names, case-insensitive uniqueness, and partial-damage behavior. Extend src/plugins/roles/roles-file.test.ts and src/plugins/roles/activate.test.ts for adding and renaming to __proto__, editing a hand-written file containing it, and adding, renaming, and moving mixed numeric and ordinary names; assert written textual order, reread list order, published order, and preservation of descriptions and duplicate model entries. Existing round-trip tests cover only ordinary names, and a null-prototype object alone would leave numeric ordering broken.


* Handle stale positional entry edits before they remove, reorder, or change the effort of another entry.

Existing Issue: Entry mutations carry only indices from the displayed list, but queued handlers apply those indices to a newly read list after earlier mutations have shifted its positions. Severity: 8/10

Existing Risk: 6/10 - Removing displayed entries at indices zero and one from the same three-entry snapshot removes the first and third entries, and concurrent reorder or effort edits can silently change a choice the user never targeted.

Proposal Risk: 2/10 - A stale edit becomes a visible retry instead of changing another entry, although freshness checks must distinguish identical entries and execute within the serialized mutation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "reject stale positional roles entry mutations". Extend the index-based intent contracts and guards in src/plugins/roles/shared.ts with an expected ordered-entry snapshot or equivalent revision bound to the caller's displayed state, and populate it from web/src/plugins/roles/RoleCard.tsx and web/src/plugins/roles/roles-dnd.ts. Compare the precondition with the current roles read inside the queue in src/plugins/roles/activate.ts before remove-entry, move-entry, or set-entry-effort applies; reject mismatches with a clear retry message and republish current state without writing. Do not match only harness/model values, since a role may hold duplicate entries. Extend src/plugins/roles/activate.test.ts for two removals from one displayed snapshot, a reorder followed by an effort edit, duplicates, and two callers sharing a snapshot; verify that stale operations never mutate the wrong row. Update web/src/plugins/roles/RolesTab.test.tsx and web/src/plugins/roles/roles-dnd.test.tsx to pin the submitted preconditions and visible rejection. The existing rapid-edit test appends two named roles and therefore cannot catch shifted entry indices.


* Match the description's promise that a rejected new role name remains available for correction.

Existing Issue: The new-role control clears its name and closes before the add-role request settles, so duplicate-name and write refusals display an error after discarding the text the description says remains in the field. Severity: 4/10

Existing Risk: 4/10 - A normal refused creation forces the user to reopen the control and retype the name, unlike the recoverable rename behavior described for rejected edits.

Proposal Risk: 1/10 - Retaining the draft until acceptance makes correction possible, with duplicate submission or clearing newer typing visible in deferred-response interaction tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "retain a rejected new role name for correction". Change commitNewRole in web/src/plugins/roles/RolesTab.tsx to await the add-role outcome and close or clear the matching draft only after success; retain the editable name and the server's refusal on failure, and guard pending submissions so blur and Enter do not submit the same draft twice. Preserve explicit Escape cancellation and the rule that the next edit clears the refusal. Extend web/src/plugins/roles/RolesTab.test.tsx to reject an add with a duplicate-name message and with a write-failure message, assert that the input and text remain, then correct and successfully commit the same draft; include a delayed response to ensure newer typing is not discarded. Existing refusal tests assert only the message and never inspect whether the creation field survives. Update the relevant behavior spec if needed so the implementation supports the existing PR description without changing that description during this review.


* Deliver the plan's effort choice in the add-entry picker.

Existing Issue: The settled design specifies a harness/model/effort picker, but the picker offers only harness and model and always adds an entry with default effort. Severity: 4/10

Existing Risk: 3/10 - Adding a choice with its intended effort requires a second persisted edit after creation, leaving the keyboard workflow short of the agreed one-step configuration.

Proposal Risk: 1/10 - The picker uses the existing effort vocabulary, with default omission and selected-value persistence directly visible in intent and round-trip tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "add the planned effort choice to the roles entry picker". Add a picker effort field in web/src/plugins/roles/RoleCard.tsx using the efforts already supplied by the authoritative catalog, with a default option that omits effort and the fixed levels as explicit choices. Include a selected non-default effort in addPicked's add-entry payload, define its reset behavior when the picker opens or a harness changes, and retain the existing per-entry effort control. Extend web/src/plugins/roles/RolesTab.test.tsx for default and selected-effort submissions and src/plugins/roles/activate.test.ts for persistence through the existing add-entry handler. Update product/specs/roles.md and documentation/user-documentation/tab-types/roles.md to describe the completed picker, bringing their narrowed harness/model wording into agreement with the settled harness/model/effort decision in product/plans/complete/roles-tab.md.


* Close the new payload guard's model-catalog type boundary before client rendering.

Existing Issue: The roles payload predicate accepts any non-null object as the model catalog, including arrays and non-array or non-string model lists, while claiming those values are a record of string arrays. Severity: 4/10

Existing Risk: 3/10 - A malformed produced catalog crosses both payload checks and reaches client map calls or React children, turning a boundary validation error into a render failure that disables the plugin.

Proposal Risk: 1/10 - Complete nested validation rejects malformed catalogs before rendering, with valid empty catalogs and hand-written out-of-catalog role entries remaining covered separately.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "validate every harness model list in the roles payload guard". Strengthen isRolesPayload in src/plugins/roles/shared.ts to require catalog.models to be a record rather than an array and every own harness value to be an array containing only strings, while preserving the existing effort-list and role-entry rules. Add colocated src/plugins/roles/shared.test.ts coverage for arrays, null, scalar model-list values, non-string members, and valid empty and populated catalogs. Add client registration or boundary coverage for the roles entry in web/src/plugins/registry.test.tsx so invalid payloads are refused before web/src/plugins/roles/RolesTab.tsx calls models.map. Preserve acceptance of stored roles whose harness, model, or effort is outside the current catalog, since stale-entry warnings were explicitly deferred. The host currently constructs valid catalogs, but the new predicate's asserted type and the plan's complete-field-validation promise are not enforced by the current render tests.


* Remove the new shared roles contract's dependency on the server API.

Existing Issue: The roles shared contract imports isRecord from the server API even though the binding plugin rules require shared contracts to be import-free, adding a client runtime dependency through the server API's Node-bearing re-exports. Severity: 4/10

Existing Risk: 4/10 - A server API export or side effect can enter the browser dependency graph through the roles payload guard and break client loading despite the guard needing only a pure object check.

Proposal Risk: 1/10 - An import-free contract isolates its runtime guard from host evolution, with guard semantics and plugin chunk separation still requiring explicit coverage.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "make the roles shared contract import-free". Replace the runtime import in src/plugins/roles/shared.ts with a small local object predicate and keep all of that contract's types, constants, and guards independent of imports, following ai/guidelines/plugins-tabs.md. Keep server consumers importing the roles contract directly and the client entry in web/src/plugins/roles/index.tsx importing only its own shared contract; do not change the published server API or unrelated pre-existing shared contracts in this unit. Correct the corresponding proposed-change wording in product/plans/complete/roles-tab.md that presently prescribes the server API import. Add a regression alongside src/eslint-plugin-boundaries.test.ts or an appropriate source-dependency assertion pinning the roles shared module's lack of imports, preserve its valid payload and intent guard coverage, and verify that the production roles chunk contains no server API or Node modules. The current import reaches src/plugins/api.ts, which re-exports src/database/query.ts and src/shell/zsh-startup/script.ts, so browser safety currently depends on elimination of unrelated host exports.


* Update the launcher user reference for the new default Roles command.

Existing Issue: The default launcher rail gains Roles before Search, but its existing user reference still lists the previous command set without Roles. Severity: 3/10

Existing Risk: 3/10 - Users consulting the launcher reference miss the new default configuration surface and encounter a documented command list that disagrees with their rail.

Proposal Risk: 1/10 - A reference matching the shipped list removes that inconsistency, with future default-list drift visible by comparing the user page against the existing default-command test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "document Roles in the default launcher command rail". Update the built-in command list in documentation/user-documentation/tab-types/launcher.md to include Roles before Search and link it to documentation/user-documentation/tab-types/roles.md, using the same user-facing names and order as DEFAULT_LAUNCHER_COMMANDS in src/plugins/launcher/commands-file.ts. Keep the explanation of configured home/project launcher files and their replacement behavior intact. Cross-check the final text against product/specs/launcher.md and the default-list assertion in src/plugins/launcher/commands-file.test.ts, both of which already include Roles; verify the documentation link resolves within the existing sidebar structure without adding an implementation-mirroring test for this wording change.
