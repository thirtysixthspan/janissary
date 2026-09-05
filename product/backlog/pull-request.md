# pull-request

## ready

## development

* Refresh the New harness dialog screenshot in the user documentation, which predates the E2E browser checkbox this change adds.

Existing Issue: `documentation/user-documentation/advanced-agents/harness.md` now says the dialog carries an E2E browser toggle that stays available for every harness, while the screenshot directly below that sentence, and the alt text enumerating its fields, still show the previous form without it. Severity: 2/10

Existing Risk: 2/10 - A user comparing the page against their own dialog finds a control the page's only illustration does not have, which reads as documentation written for an older release and puts the rest of the page's accuracy in question.

Proposal Risk: 1/10 - The image matches the dialog at the moment it is taken and will drift again the next time a field is added; what would make that visible is the alt text, which should keep enumerating the fields so a later mismatch is readable in the source rather than only in the image.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: refresh the New harness dialog screenshot for the E2E browser checkbox". The page's screenshot is referenced as `/screenshots/harness-launch-dialog.png` with alt text listing "harness, label, workspace, offline, auto-approve, model, and effort" — the field set before this change. Retake it with the dialog open, the E2E browser checkbox visible between Offline and Auto-approve, matching the ordering `HarnessLaunchDialog` in `web/src/harness/HarnessLaunchDialog.tsx` renders and the ordering the prose and `product/specs/harness.md` both describe, and update the alt text to include the new toggle, which `ai/guidelines/user-documentation.md` requires to convey the same information the image does. Check whether the same screenshot is referenced from any other page under `documentation/user-documentation/` before replacing it. Nothing under `src/` or `web/src/` changes and no test covers the image, so the check is that the page renders with `npm run docs:dev` and that the new image shows the five controls in the order the surrounding text names.

## deferred

## declined
