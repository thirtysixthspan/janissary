<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make `registerDirtyHandle(null)` remove the registration while keeping placement remounts safe.

Existing Issue: The public capability and developer documentation say `registerDirtyHandle(null)` drops unsaved work, but `App.registerPluginDirtyHandle` keeps the previous handle whenever its tab label is still open, so a live plugin cannot explicitly remove a stale registration. Severity: 6/10

Existing Risk: 5/10 - A plugin that drops its handle can keep a stale dirty marker and be asked to save work that it no longer owns when the user closes or quits.

Proposal Risk: 2/10 - Explicit drops remove the handle while closed-label pruning still owns final cleanup, leaving placement remount behavior dependent on the plugin not clearing its registration during view teardown.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "honor explicit null dirty-handle registrations". In `web/src/App.tsx`, make an explicit `registerPluginDirtyHandle(label, null)` remove that label's handle and update its dirty marker. In `web/src/plugins/image/useImageEdit.ts`, stop using a `register(null)` effect cleanup to represent placement unmount; the host already prunes registrations when the tab label closes, and re-registration when the dirty answer changes replaces the current handle. Keep the API contract in `web/src/plugins/api.ts` and `documentation/developer-documentation/tab-plugins.md` explicit that `null` drops a registration and that placement teardown does not need to unregister it. Update the image editor lifecycle test that currently expects a null registration on unmount, and add coverage that an explicit null while the tab remains open clears the dirty marker and no longer invokes the old handle; retain the App docking test proving the handle survives a placement remount and the closed-label pruning tests proving teardown. Verify an unmount during a placement move does not lose dirty state, while explicit null stops a quit walk from asking about the removed handle.


* Fold the completed implementation subplans into the canonical feature plan and remove the stale subplan reference.

Existing Issue: Nine completed implementation subplans remain beside the canonical plan despite the one-plan-per-pull-request rule, the pull request description says they remain, and subplan 09 refers to the deleted `quit-walk-gone-tab-title-test.md` plan. Severity: 4/10

Existing Risk: 4/10 - Duplicate completed plans can drift from the canonical record and the dead dependency can send future maintainers looking for a plan that no longer exists.

Proposal Risk: 1/10 - The canonical plan becomes the sole completed feature plan with no dangling subplan reference, while the delivered implementation and its review remain unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "fold completed subplans into the canonical feature plan". Treat `product/plans/complete/quitting-with-unsaved-work.md` as the sole canonical plan; fold any still-needed decisions, final outcomes, and verification context from `product/plans/complete/01-move-unsaved-work-modules.md` through `09-specs-docs-and-verification.md` into it, then remove those nine completed subplan files. Ensure the deleted `quit-walk-gone-tab-title-test.md` reference from subplan 09 is not copied into the canonical plan, and update the pull request description's claims that the implementation subplans remain so it identifies the canonical plan accurately. Preserve the canonical plan's title, structure, and original complexity rating. Verify that the canonical plan covers the delivered feature, no completed implementation subplans or reference to the removed fix plan remain, and the one-plan rule in `product/specs/pull-request-updating.md` is satisfied.
