<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
