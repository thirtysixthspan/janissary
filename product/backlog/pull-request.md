<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the debt the shared-confirmation change left in the delete dialog's note styling and its absence test.

Existing Issue: The delete dialog's note styling is split across three places after the shared-confirmation change: the scripts stylesheet still defines .scripts-delete-note although no component renders it, the only check for an absent note line in web/src/plugins/scripts/DeleteScriptDialog.test.tsx queries that dead class and so passes whatever the dialog shows, and web/src/shared/ConfirmDialogShell.tsx colors each note with an inline style because the shared modal stylesheet has no note class. Severity: 3/10

Existing Risk: 3/10 - A stray schedule-count line or open-tab line in the delete dialog, the one thing a user reads before removing a runscript that is in use, would ship while the suite stays green, because no test asserts that either line is absent.

Proposal Risk: 1/10 - With the absence check asserting on the note text and the note color held in one shared class, a stray line fails the suite and the note styling has a single home, leaving only the chance of a theme token typo that a visual check would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "retire the dead note rule and the vacuous absence check, and move the note color into a shared class". In web/src/plugins/scripts/DeleteScriptDialog.test.tsx, rewrite the test named "leaves out both lines for a runscript with no schedule and no open tab" so it asserts with queryByText that neither "Used by 1 system schedule. It will fire as missing after this." nor "Open in an editor tab. The tab keeps its text." is in the document, and drop its query for .scripts-delete-note. In web/src/plugins/scripts/scripts.css, delete the .scripts-delete-note rule once a grep confirms that no file other than that test names it. In web/src/theme.css, beside the existing .modal-title rule, add a class for dialog note lines that sets color to var(--muted), and in web/src/shared/ConfirmDialogShell.tsx replace the inline style on each note element with that class, keeping the note text, key, and order unchanged. The other tests in those two test files and in web/src/shared/ConfirmDialog.test.tsx, which query note text, must pass without edits, and the ConfirmDialog and ConfirmDialogShell callers that pass no notes must render the same markup as before. Verify with the diff-scoped checks.


* Correct the pull request description's Files changed list and its delete-dialog verification step so both match the diff.

Existing Issue: The description says its Files changed section names the areas the diff touches, but it leaves out the web/src/shared ConfirmDialog and ConfirmDialogShell change and its test, and its verification step 11 presses Cancel, then Escape, then clicks outside the dialog without reopening it, so after Cancel the later Escape and click act on no dialog and the following confirm acts on whichever row the stray click selected. Severity: 2/10

Existing Risk: 3/10 - A reviewer who scopes the change from the Files changed list would not look at the shared dialog that QuitDialog, UnsavedQuitDialog, and DeleteFileDialog render through, and a tester who follows step 11 literally could delete a runscript other than the one the step names.

Proposal Risk: 1/10 - Once the list names the shared dialog area and step 11 reopens the dialog before each dismissal, the description and the diff agree, leaving only the ordinary chance that the wording drifts again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "correct the description's Files changed list and its delete-dialog verification step". Edit the pull request body only, never source. Under the Client part of Files changed, add web/src/shared/ConfirmDialog.tsx, web/src/shared/ConfirmDialogShell.tsx, and their colocated tests, and state that the delete dialog renders through the shared ConfirmDialog with an optional notes prop that the other callers leave unset. Rewrite How to verify step 11 so each dismissal reopens the dialog: press Delete then Cancel; press Delete then Escape; press Delete, click outside the dialog, and confirm the dialog is still open; then press Delete then y, and confirm the next row is selected. Check each added sentence against git diff origin/master...HEAD --name-only and product/specs/scripts-tab.md before saving, and leave every other part of the body unchanged.
