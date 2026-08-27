# Replace saved profiles atomically

**Complexity: 5/10** — the change is localized to profile saving, but must preserve the previous file across asynchronous capture failures and interrupted replacement.

## Goal

Saving over a profile must leave its last valid file intact until the complete replacement snapshot is ready and durably written. A failed capture or write must not remove the existing profile or its legacy sibling directory.

## Approach

Build and serialize the full profile before mutating either destination. Add a small same-directory atomic-write helper that creates a unique temporary sibling, cleans it up on failure, and renames it over the target. Remove the stale legacy directory only after the replacement file has committed successfully.

## Implementation steps

1. Add a focused atomic text-write helper under `src/` for same-directory temporary replacement and cleanup.
2. Reorder `src/profile/save.ts` so asynchronous capture and serialization finish before atomic replacement, then remove the stale legacy directory after success.
3. Add `src/profile/save.test.ts` coverage proving a capture failure preserves both the old profile and legacy directory, and a successful overwrite leaves one valid file with no temporary sibling.
4. Update `product/specs/profiles.md` and the existing profile user documentation with the replacement guarantee.

## Tests

- A failure while collecting the replacement leaves the prior profile bytes and stale legacy directory unchanged.
- A successful overwrite atomically installs the new valid profile, removes the stale legacy directory, and leaves no temporary sibling.
- Run `./scripts/run.mjs check-diff` after every implementation, test, spec, documentation, and backlog change.

## Out of scope

- Adding profile-save confirmation or version history.
- Changing which session state a profile captures.
- Making unrelated persistence files atomic.
