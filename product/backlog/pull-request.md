<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's Files changed list so it names the shared theme stylesheet the feature changes.

Existing Issue: The description's Files changed list omits web/src/theme.css, which the diff changes to add the muted .modal-note class used by the shared confirmation dialog's note lines, so the list does not name every file the feature changes. Severity: 2/10

Existing Risk: 3/10 - A reviewer who scopes the shared modal styling from the Files changed list would miss that the shared stylesheet changed, so a later edit to the note class would be reviewed without the description pointing at it.

Proposal Risk: 1/10 - Once the list names the stylesheet and the rest of the description stays as written, the remaining risk is ordinary drift when later commits add files, which the description already carries.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "name web/src/theme.css in the pull request description's Files changed list". Add web/src/theme.css to the Client part of the description's Files changed list, beside the shared confirmation dialog entry, and state that it adds the .modal-note class, which sets the muted color for the note lines ConfirmDialogShell renders between the title and the buttons. Then compare the named files with the output of git diff origin/master...HEAD --name-only and confirm that every non-test, non-plan file the diff changes is named, leaving the rest of the description as written. Make no code, test, or spec change. Verify by reading the description back after the edit and checking its named files against that name-only list.


* Deliver the plan's rule that every runscript action failure reaches the notifications feed, starting with the editor's size refusal for an oversized runscript.

Existing Issue: Opening a runscript larger than the editor's two-megabyte limit, through Open, Enter, or Duplicate, makes the editor refuse it and write the reason to the scripts tab's own transcript, which that tab never renders, so the feed stays silent and the runscript or its copy does not open. Severity: 5/10

Existing Risk: 3/10 - A user who opens a large runscript sees nothing happen and no reason, so they may retry or conclude the scripts tab is broken, and the spec's rule that every failure line reaches the feed stays false for this path.

Proposal Risk: 1/10 - Once the feed carries the refusal in the editor's own wording, the residual risk is a spec table that falls out of step, which the proposal updates in the same change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "report the editor's size refusal for an oversized runscript to the notifications feed". In src/openers/editor.ts, extract the rule openInEditor applies, the comparison against EDITOR_MAX_BYTES and the text "edit: <name> is <size> — too large to edit in-app (limit <size>).", which uses humanSize from src/openers/size.ts, into an exported pure helper that returns that text for a name and byte count, or undefined within the limit, and have openInEditor call it so its transcript note keeps the same text. In src/plugins/runscript-topic-actions.ts, have openRunscript stat the target before calling managers.openFile.edit: when the helper returns text, post it with post(managers, origin, text) and skip the edit call; when the stat fails, fall through to the existing edit path. Duplicate also reaches openRunscript, so the copy of an oversized source is covered by the same change. In src/plugins/runscript-topic-actions.test.ts, replace the case titled "opens a runscript over the editor size limit without posting to the feed", which mocks openFile.edit and so proves only delegation while its title claims the file opens. The replacement asserts that an oversized Open posts the helper text under the origin label with no edit call, and that an oversized Duplicate leaves the copy on disk and posts the same text. Add a unit case for the helper in src/openers/editor.test.ts beside its existing size tests. In product/specs/scripts-tab.md, add a row to the Failure text table for this text, produced by Open and Duplicate, so the spec's rule that each failure line reaches the feed holds. Verify with ./scripts/run.mjs check-diff.
