# pull-request

* Correct the default-branch field's doc comment, which states a remote-tree classification the classifier does not implement.

Existing Issue: The comment added to `GitMetadata.defaultBranch` in `src/file-navigator/filesystem-port.ts` says the field is "Absent for a remote tree", while `RemotePort.gitMetadata` (`src/file-navigator/remote-port.ts`) spreads the far side's reply verbatim and so forwards whatever that host resolved; the plan file goes further and claims an absent field "classifies as unconfirmed and therefore unsynced", which `isPrimaryBranch` in `src/git/status.ts` contradicts outright — an absent detected default falls back to exact membership in `master`/`main` and therefore classifies as *primary*. Severity: 3/10

Existing Risk: 3/10 - The comment sits on the one field the sync gate's branch decision is built from, so the next reader reasoning about whether a tree can enable syncing takes the fallback's direction backwards, and the containment that currently keeps remote trees out of the gate rests on path shape rather than on the classification the comment claims.

Proposal Risk: 2/10 - The comment will describe the classifier accurately, but remote trees stay outside the gate by path shape alone, so a sync-paths entry broad enough to cover the remote-file cache directory would still reach the gate with a remote tree's branch.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1082: correct the default-branch comment's remote-tree claim". In `src/file-navigator/filesystem-port.ts`, rewrite the comment on `GitMetadata.defaultBranch` to say what is true: the field carries `origin/HEAD`'s name when the resolving host can determine it, a remote tree reports whatever its own host resolved for its workspace, and an absent value does not mean "unsynced" — `isPrimaryBranch` in `src/git/status.ts` falls back to exact membership in `master`/`main`, so an absent default with `master` checked out classifies as primary. Say separately, and as the actual reason remote trees stay out of the gate, that a remote file is materialized under `<projectDir>/.janissary/remote-files/` by `src/file-navigator/remote-file-cache.ts` and so does not match a launch-dir-relative sync path. Then fix the same claim in `product/plans/complete/disable-git-sync-off-primary-branch.md`, whose bullet on `GitMetadata` states the incorrect classification — the plan is complete and its record should not assert a behavior the merged code does not have. No behavior changes and no new tests; the existing `isPrimaryBranch` cases in `src/git/status.test.ts` already pin the fallback the corrected comment describes.


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
