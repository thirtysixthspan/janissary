<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's store-level regression coverage for failed atomic replacement and preservation of the previous snapshot.

Existing Issue: The system schedule store tests cover successful writes and malformed/future-version handling, but none forces an atomic replacement failure and verifies that the previous snapshot remains intact as plan 07 requires. Severity: 5/10

Existing Risk: 5/10 - A later change could acknowledge or partially apply a failed save without any focused store regression test detecting loss or corruption of persisted schedules.

Proposal Risk: 2/10 - A failure-path regression test leaves only the low-probability underlying filesystem failure, with the old snapshot preservation contract guarded against code regressions.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "cover failed system schedule store replacement". Add a colocated test in `src/schedule/system/storage.integration.test.ts` or a focused store test that first saves a valid snapshot, then causes the actual temporary-file write or rename used by `SystemScheduleStore.save()` to fail, and asserts that the save returns an I/O failure, the prior store bytes remain unchanged, and no temporary file is left behind. Keep the failure deterministic and isolated to the test's scratch project. The existing successful round-trip, malformed JSON, unsupported-version, and startup-clear retention cases in that integration test must remain intact; no current test protects this failure contract.
