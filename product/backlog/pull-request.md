# pull-request

* Remove the defensive optional chain this change adds on the required file-navigator manager, which exists only because a test deletes the manager key outright.

Existing Issue: `src/open/file-manager.ts` reads `this.managers.fileNavigator?.onPrimaryBranch(label)`, but `fileNavigator` is a required member of `Managers` (`src/managers.ts`) populated unconditionally in `src/controller/create-managers.ts`, so the `?.` is dead in production — the only optional-chained required manager anywhere in `src/` — and is triggered solely by the new branch-gate tests' `delete managers.fileNavigator` in `src/open/file-manager.test.ts`. Severity: 2/10

Existing Risk: 2/10 - If the manager were ever genuinely absent (a partial test double, a future initialization-order change), the gate silently falls back to the launch-dir classification instead of surfacing the wiring error, and the pattern normalizes optional-chaining away the `Managers` contract.

Proposal Risk: 1/10 - The change removes an operator and adjusts test stubs; any mistake fails typecheck or the touched tests immediately.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1082: drop the dead optional chain on managers.fileNavigator in the sync gate". In `src/open/file-manager.ts`, change `this.managers.fileNavigator?.onPrimaryBranch(label)` to `this.managers.fileNavigator.onPrimaryBranch(label)`. In `src/open/file-manager.test.ts`, replace the `delete managers.fileNavigator` in the "follows the launch dir branch" `it.each` with a stub that satisfies the type and models a non-navigator label faithfully: `makeSyncedManagers` already builds `fileNavigator: { onPrimaryBranch: () => navigatorPrimary }`, so pass a setup whose `onPrimaryBranch` returns `undefined` (the production answer for a label that names no navigator tab) instead of removing the manager — the launch-dir fallback assertion (`isLaunchDirOnPrimaryBranch` called with the launch dir) is unchanged. Verify the whole `branch gate` describe still passes and no other test relied on the key being absent.


* Split the unrelated CSS formatting fixes in `web/src/plugins/pdf/pdf-text-layer.css` out of this feature PR into a separate commit or pull request.

Existing Issue: `web/src/plugins/pdf/pdf-text-layer.css` adds three empty-line-before formatting changes required by the stylelint gate, but the PR is a feature that disables git-sync off the primary branch — the CSS file has no logical connection to the git-sync gate, the navigator branch metadata, or any other change in the diff. Severity: 2/10

Existing Risk: 2/10 - A reviewer scanning the diff list sees a CSS file in a git-sync feature PR and spends cycles determining whether the formatting changes interact with the feature, or a later revert of the feature accidentally reverts the formatting fixes too.

Proposal Risk: 1/10 - Splitting a formatting-only commit into its own PR or separating it with a clear commit boundary removes the noise with no behavior change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1082: split the unrelated pdf-text-layer.css formatting fixes out of the feature PR". The three changes in `web/src/plugins/pdf/pdf-text-layer.css` (adding blank lines before custom property declarations at lines 28, 55, and 58) are pure stylelint compliance fixes with no functional relationship to the git-sync feature. Either extract them into a standalone PR merged before this one, or move them into a separate commit within this PR with a commit message that names the stylelint gate as the motivation. The CSS changes themselves are correct and need no modification — only their bundling with unrelated work changes.
