# Failed system schedule store replacement coverage

**Complexity: 2/10** — add a deterministic isolated regression case for a storage failure already handled by the atomic writer.

## Goal

Protect the system schedule store's contract that a failed replacement reports an I/O failure, preserves the previous snapshot, and cleans up its temporary file.

## Approach

Extend the existing scratch-project storage integration test. Save a valid snapshot, record its bytes, make the scratch `.janissary` directory unwritable, and attempt to save a different valid snapshot. Assert the returned result is an I/O failure, the original bytes are unchanged, and the directory contains no temporary artifact. Restore directory permissions during cleanup.

The test exercises `SystemScheduleStore.save()` and the real atomic writer rather than mocking filesystem operations. No store implementation change is planned because the writer already removes the temporary path and rethrows failed writes or renames.

## Implementation steps

1. Add a focused failure-path test to `src/schedule/system/storage.integration.test.ts`, preserving its existing storage cases.
2. Run `./scripts/run.mjs check-diff`.
3. Promote this plan to complete and remove the resolved pull-request backlog entry.

## Tests

Verify the failed save's `io` result, byte-for-byte preservation of the prior snapshot, and absence of temporary files after the actual temporary-file write fails in an isolated scratch project.

## Specs and documentation

No updates. This adds regression coverage for existing documented behavior without changing user-visible behavior.

## Out of scope

Changing `SystemScheduleStore`, `atomicWriteFile`, the schedule format, other storage tests, or PR description.
