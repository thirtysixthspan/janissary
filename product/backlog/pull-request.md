<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description and the user documentation to say a harness tab's resume is cancelled with `schedule cancel auto-resume in <label>`, since a bare `schedule cancel` targets the issuing tab.

Existing Issue: Both the pull request's "How to verify" step 9 and the new "Resuming after a usage limit" section in `documentation/user-documentation/advanced-agents/harness.md` tell the user to run `schedule cancel auto-resume`, but a harness tab has no command bar and `schedule cancel` without an `in <tab>` clause operates on the issuing tab's own schedule, so from an agent tab it answers `No scheduled command "auto-resume".` Severity: 3/10

Existing Risk: 4/10 - A user follows the documented step, is told the command does not exist, and concludes the entry is uncancellable — the one control the plan named for a user who wants the tab left parked.

Proposal Risk: 1/10 - The corrected text names the clause the parser already requires, so the documented behavior matches what the command does.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1525: document the `in <tab>` clause needed to cancel a harness tab's auto-resume". In the pull request body's "How to verify", change step 9 to `schedule cancel auto-resume in codex` run from an agent tab, and note that the `in <tab>` clause is what reaches a harness tab's schedule. Make the same correction in `documentation/user-documentation/advanced-agents/harness.md`'s "Resuming after a usage limit" section, and while there state that the clause is required for the same reason the scheduling documentation gives — a harness tab cannot run commands itself, so `in <label>` is the only way to manage its timers. Check `product/specs/harness.md`'s Auto-resume section for the same bare form and correct it in the same change; `product/specs/scheduling.md` already documents the clause correctly and must not change. No code changes; the parser, `ScheduleManager.cancel`, and `src/commands/schedule.ts` are all correct as they stand.

* Regenerate the New harness dialog screenshot, whose fields and alt text no longer match the dialog now that it carries an Auto-resume toggle.

Existing Issue: `documentation/user-documentation/advanced-agents/harness.md` shows the launch-dialog screenshot with the alt text "fields for harness, label, workspace, offline, E2E browser, auto-approve, model, and effort", and the prose beside it now describes an Auto-resume toggle the image does not contain. Severity: 3/10

Existing Risk: 3/10 - The one image a reader has of the dialog misstates its contents on the page whose job is introducing the dialog, and the prose immediately below it mentions a control absent from the picture.

Proposal Risk: 1/10 - The regenerated image matches the dialog that ships, and the alt text change is confined to the same line.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1525: regenerate the New harness dialog screenshot for the Auto-resume toggle". Follow `ai/tasks/take-documentation-screenshots.md` to recapture the New harness dialog at its existing `data-doc-shot="harness-launch-dialog"` anchor, replacing `documentation/screenshots/harness-launch-dialog.png` in place, and update that page's alt text to include auto-resume so it lists every field the dialog shows. The dialog itself needs no change: `web/src/harness/HarnessLaunchDialog.tsx` already renders the toggle with the same markup as its siblings. Run `./scripts/run.mjs check-diff` after the image swap, and confirm no other screenshot on that page or elsewhere in `documentation/` embeds the same dialog and needs the same refresh.