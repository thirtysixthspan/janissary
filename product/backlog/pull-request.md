<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle stale positional entry edits before they remove, reorder, or change the effort of another entry.

Existing Issue: Entry mutations carry only indices from the displayed list, but queued handlers apply those indices to a newly read list after earlier mutations have shifted its positions. Severity: 8/10

Existing Risk: 6/10 - Removing displayed entries at indices zero and one from the same three-entry snapshot removes the first and third entries, and concurrent reorder or effort edits can silently change a choice the user never targeted.

Proposal Risk: 2/10 - A stale edit becomes a visible retry instead of changing another entry, although freshness checks must distinguish identical entries and execute within the serialized mutation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1668 "reject stale positional roles entry mutations". Extend the index-based intent contracts and guards in src/plugins/roles/shared.ts with an expected ordered-entry snapshot or equivalent revision bound to the caller's displayed state, and populate it from web/src/plugins/roles/RoleCard.tsx and web/src/plugins/roles/roles-dnd.ts. Compare the precondition with the current roles read inside the queue in src/plugins/roles/activate.ts before remove-entry, move-entry, or set-entry-effort applies; reject mismatches with a clear retry message and republish current state without writing. Do not match only harness/model values, since a role may hold duplicate entries. Extend src/plugins/roles/activate.test.ts for two removals from one displayed snapshot, a reorder followed by an effort edit, duplicates, and two callers sharing a snapshot; verify that stale operations never mutate the wrong row. Update web/src/plugins/roles/RolesTab.test.tsx and web/src/plugins/roles/roles-dnd.test.tsx to pin the submitted preconditions and visible rejection. The existing rapid-edit test appends two named roles and therefore cannot catch shifted entry indices.
