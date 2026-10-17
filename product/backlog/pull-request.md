<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver reliable coverage for failed schedule-store replacement and temporary-file cleanup.

Existing Issue: The replacement test relies on `chmod(0o555)` to make the schedule directory unwritable, which does not prevent writes when the test process runs as root, and in that case the expected I/O failure does not occur; when it does fail at open, no temporary file was created, so the cleanup assertion does not exercise cleanup of a partially completed atomic write. Severity: 4/10

Existing Risk: 4/10 - A privileged CI or developer environment can fail this test despite correct storage behavior, while failures after temporary-file creation remain unguarded by its cleanup assertion.

Proposal Risk: 2/10 - A deterministic failure-path test would run consistently and verify temporary-file removal after the writer has created the temporary file, while retaining coverage that failed saves preserve the previous snapshot.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "make failed schedule-store replacement coverage reliable". Replace the permission-only assumption in `src/schedule/system/storage.integration.test.ts` with a failure setup whose outcome is deterministic across privileged and unprivileged processes, and keep the assertions that the store returns an I/O error and preserves the prior bytes. Add focused failure-cleanup coverage for `atomicWriteFile` in `src/atomic-write.test.ts` by choosing a target that lets the temporary file be written but makes the final rename fail, then assert the temporary artifact is removed and the original destination state is unchanged. If retaining the store permission test, explicitly account for effective root privileges rather than expecting directory mode bits to deny the write. Preserve the existing schedule-storage and atomic-writer success coverage.
