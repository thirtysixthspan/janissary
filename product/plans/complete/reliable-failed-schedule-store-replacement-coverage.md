# Reliable failed schedule-store replacement coverage

**Complexity: 2/10** — strengthen failure-path tests without changing storage behavior.

## Goal

Make failed schedule-store replacement coverage deterministic under privileged and unprivileged processes, and verify cleanup after an atomic writer has created its temporary file.

## Approach

Replace chmod-based failure in the schedule integration test with a narrowly scoped `renameSync` failure. This drives `SystemScheduleStore.save()` through the real temporary-file write and atomic replacement path regardless of effective user permissions. Restore the spy after the test and continue asserting the I/O result, unchanged previous bytes, and absence of a temporary artifact.

Add an atomic writer test that spies on only the final rename, allowing temporary-file creation to succeed before throwing. Verify the preexisting destination remains unchanged and the temporary file is removed.

## Implementation steps

1. Replace the permission-only schedule-store failure setup with a deterministic final-rename failure.
2. Add direct atomic-writer cleanup coverage for a failed final rename.
3. Update the scheduling behavior spec to state that a failed replacement preserves the saved snapshot.
4. Run `./scripts/run.mjs check-diff` after each change.
5. Promote this plan to complete and remove the resolved pull-request backlog entry.

## Tests

The schedule integration test must assert `kind: 'io'`, byte-for-byte preservation of the prior snapshot, and no temporary artifact. The atomic-writer test must assert that a rename failure leaves the prior destination contents intact and removes the temporary file. Existing success cases remain in place.

## Specs and documentation

Update `product/specs/scheduling.md` with the failed-replacement guarantee. No user documentation changes are needed because this is an existing storage failure contract, not a user-facing behavior change.

## Out of scope

Changing `SystemScheduleStore`, `atomicWriteFile`, the snapshot format, other storage behavior, or the PR description.
