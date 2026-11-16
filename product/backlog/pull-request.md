<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Verify the original failure reason survives a failed restore.

Existing Issue: The restore-failure test checks the reported path and restored flag but does not assert the original failure reason required by the plan. Severity: 4/10

Existing Risk: 4/10 - A regression that reports an undo error instead of the original write failure could escape the promised coverage and mislead users diagnosing an incomplete restore.

Proposal Risk: 1/10 - Other failure mappings still depend on their existing tests, but distinct injected errors and a literal assertion detect replacement of the original reason in this case.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "verify the original failure reason survives a failed restore". Extend the restore-failure case in src/file-patch/commit.test.ts to inject distinguishable original write and undo errors and assert that the returned reason maps the original failure while the path and restored flag remain correct and remaining undos still run. Run the diff-scoped checks.

