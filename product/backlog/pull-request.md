<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Regenerate the New harness dialog screenshot, whose fields and alt text no longer match the dialog now that it carries an Auto-resume toggle.

Existing Issue: `documentation/user-documentation/advanced-agents/harness.md` shows the launch-dialog screenshot with the alt text "fields for harness, label, workspace, offline, E2E browser, auto-approve, model, and effort", and the prose beside it now describes an Auto-resume toggle the image does not contain. Severity: 3/10

Existing Risk: 3/10 - The one image a reader has of the dialog misstates its contents on the page whose job is introducing the dialog, and the prose immediately below it mentions a control absent from the picture.

Proposal Risk: 1/10 - The regenerated image matches the dialog that ships, and the alt text change is confined to the same line.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1525: regenerate the New harness dialog screenshot for the Auto-resume toggle". Follow `ai/tasks/take-documentation-screenshots.md` to recapture the New harness dialog at its existing `data-doc-shot="harness-launch-dialog"` anchor, replacing `documentation/screenshots/harness-launch-dialog.png` in place, and update that page's alt text to include auto-resume so it lists every field the dialog shows. The dialog itself needs no change: `web/src/harness/HarnessLaunchDialog.tsx` already renders the toggle with the same markup as its siblings. Run `./scripts/run.mjs check-diff` after the image swap, and confirm no other screenshot on that page or elsewhere in `documentation/` embeds the same dialog and needs the same refresh.