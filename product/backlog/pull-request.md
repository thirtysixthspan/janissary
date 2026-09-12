# pull-request

* Split the unrelated CSS formatting fixes in `web/src/plugins/pdf/pdf-text-layer.css` out of this feature PR into a separate commit or pull request.

Existing Issue: `web/src/plugins/pdf/pdf-text-layer.css` adds three empty-line-before formatting changes required by the stylelint gate, but the PR is a feature that disables git-sync off the primary branch — the CSS file has no logical connection to the git-sync gate, the navigator branch metadata, or any other change in the diff. Severity: 2/10

Existing Risk: 2/10 - A reviewer scanning the diff list sees a CSS file in a git-sync feature PR and spends cycles determining whether the formatting changes interact with the feature, or a later revert of the feature accidentally reverts the formatting fixes too.

Proposal Risk: 1/10 - Splitting a formatting-only commit into its own PR or separating it with a clear commit boundary removes the noise with no behavior change.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1082: split the unrelated pdf-text-layer.css formatting fixes out of the feature PR". The three changes in `web/src/plugins/pdf/pdf-text-layer.css` (adding blank lines before custom property declarations at lines 28, 55, and 58) are pure stylelint compliance fixes with no functional relationship to the git-sync feature. Either extract them into a standalone PR merged before this one, or move them into a separate commit within this PR with a commit message that names the stylelint gate as the motivation. The CSS changes themselves are correct and need no modification — only their bundling with unrelated work changes.
