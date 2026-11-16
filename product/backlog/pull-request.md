<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Avoid quadratic path lookup when creating many patch folders.

Existing Issue: Each folder creation rebuilds and scans the full list of move destinations and write targets to determine its reported path. Severity: 6/10

Existing Risk: 6/10 - A valid patch with many files in separate new folders can monopolize the synchronous server as path comparisons and allocations grow quadratically.

Proposal Risk: 2/10 - Large patches still require work proportional to their paths and folder depth, but indexing reporting paths avoids rescanning every change for each folder.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "avoid quadratic patch folder reporting lookup". Update src/file-patch/commit.ts to determine each planned folder's first applicable typed path in rename-destination then write-target order without rebuilding and scanning all places per folder, preserving nested-folder and failure reporting semantics. Add focused coverage in src/file-patch/commit.test.ts for multiple nested and shared folders, precedence between rename and write paths, and a large collection that verifies the lookup does not scan all changes for every folder. Run the diff-scoped checks.


* Verify the original failure reason survives a failed restore.

Existing Issue: The restore-failure test checks the reported path and restored flag but does not assert the original failure reason required by the plan. Severity: 4/10

Existing Risk: 4/10 - A regression that reports an undo error instead of the original write failure could escape the promised coverage and mislead users diagnosing an incomplete restore.

Proposal Risk: 1/10 - Other failure mappings still depend on their existing tests, but distinct injected errors and a literal assertion detect replacement of the original reason in this case.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "verify the original failure reason survives a failed restore". Extend the restore-failure case in src/file-patch/commit.test.ts to inject distinguishable original write and undo errors and assert that the returned reason maps the original failure while the path and restored flag remain correct and remaining undos still run. Run the diff-scoped checks.

