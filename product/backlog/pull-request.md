<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Qualify the patch help and spec's unconditional restore promise so the failed-restore case is visible.

Existing Issue: help/file.md says every check runs before anything is written and any failure leaves every file as it was, and product/specs/acp.md says a patch that fails while writing puts back every path it changed, while product/plans/complete/file-patch.md's failure-while-applying decision and help/file.md's own applying-failure bullet allow a failed restore to leave some files changed. Severity: 2/10

Existing Risk: 2/10 - A reader can conclude no failed patch ever needs the tree inspected, when a failed restore is exactly the case that can leave changed files behind.

Proposal Risk: 1/10 - The reworded sentences must keep the ordinary restore success path and the documented Some files may have been changed exception distinct, so a reader does not think every failure may leave files changed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "qualify the patch help and spec restore promise". In help/file.md's Patching several files section, replace the sentence that every check runs before anything is written and any failure leaves every file as it was with one that says sections are checked against the in-memory view before anything is written, that a failure while applying restores the files already changed, and that a failed restore can leave some files changed, pointing to the applying-failure bullet. In product/specs/acp.md's file patch section, add the same qualification to the sentence about a patch that fails while writing, naming the Some files may have been changed line beside the ordinary No files were changed line. Do not change the runner or the applying-failure implementation; the fix plans' restore cases and the help applying-failure bullet remain the behavior. Keep the rest of the patch help and spec untouched.
