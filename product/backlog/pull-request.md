<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that restoring selection leaves the issuing tab focused.

Existing Issue: The description says a restored selection does not take focus away from the issuing tab, while the planned command behavior still focuses an existing center navigator or makes a newly opened center navigator active. Severity: 3/10

Existing Risk: 3/10 - Readers may expect the issuing tab to stay active and mistake the navigator's normal focus behavior for a view-restoration regression.

Proposal Risk: 1/10 - Clarifying that restoration itself leaves normal command focus behavior unchanged removes the expectation mismatch while retaining the planned behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "clarify command-restoration focus behavior". Revise the focus sentence in PR #1803's description to say that applying the restored selection does not alter the normal focus behavior of the `files` command; make clear that opening or focusing a center navigator can still make it active. Check the wording against `src/file-navigator/open-command.ts`, `product/plans/complete/restoring-a-file-trees-view-from-the-command-line.md`, and `product/specs/file-navigator-tab.md`, and leave implementation behavior unchanged. Verify that the updated sentence describes both opening a new center tree and focusing an existing one, then compare the rest of the PR description to confirm it is untouched.
