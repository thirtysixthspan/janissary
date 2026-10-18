<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's Files changed list and its delete-dialog verification step so both match the diff.

Existing Issue: The description says its Files changed section names the areas the diff touches, but it leaves out the web/src/shared ConfirmDialog and ConfirmDialogShell change and its test, and its verification step 11 presses Cancel, then Escape, then clicks outside the dialog without reopening it, so after Cancel the later Escape and click act on no dialog and the following confirm acts on whichever row the stray click selected. Severity: 2/10

Existing Risk: 3/10 - A reviewer who scopes the change from the Files changed list would not look at the shared dialog that QuitDialog, UnsavedQuitDialog, and DeleteFileDialog render through, and a tester who follows step 11 literally could delete a runscript other than the one the step names.

Proposal Risk: 1/10 - Once the list names the shared dialog area and step 11 reopens the dialog before each dismissal, the description and the diff agree, leaving only the ordinary chance that the wording drifts again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "correct the description's Files changed list and its delete-dialog verification step". Edit the pull request body only, never source. Under the Client part of Files changed, add web/src/shared/ConfirmDialog.tsx, web/src/shared/ConfirmDialogShell.tsx, and their colocated tests, and state that the delete dialog renders through the shared ConfirmDialog with an optional notes prop that the other callers leave unset. Rewrite How to verify step 11 so each dismissal reopens the dialog: press Delete then Cancel; press Delete then Escape; press Delete, click outside the dialog, and confirm the dialog is still open; then press Delete then y, and confirm the next row is selected. Check each added sentence against git diff origin/master...HEAD --name-only and product/specs/scripts-tab.md before saving, and leave every other part of the body unchanged.
