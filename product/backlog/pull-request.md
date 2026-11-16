<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Allow a moved symbolic link to be deleted or moved again when its new target is missing.

Existing Issue: Every section follows a moved link before selecting the operation, so a link moved into a directory where its relative target is absent cannot subsequently be deleted or renamed. Severity: 6/10

Existing Risk: 5/10 - A valid sequence that removes or relocates a link fails even though those operations act on the link itself and do not require its destination to exist.

Proposal Risk: 2/10 - Link path validation remains necessary, but operation-specific following can preserve containment while allowing link-entry operations and rejecting unsafe content updates.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "allow deleting or moving a moved dangling symbolic link". Update src/file-patch/sections.ts and src/file-patch/moves.ts to distinguish operations that follow content from Delete and move-only operations on an already validated link entry, preserving existing rejection of initially dangling links and validating destination paths; keep following for updates and move hunks. Add cases in src/file-patch/sections.test.ts that move a relative link to a directory with a missing target and then delete it or move it to another location, alongside a case that still rejects an update through the dangling link. Preserve existing move-chain and containment coverage and run the diff-scoped checks.


* Cover the moved link's protected target policy.

Existing Issue: The moved-link fix plan requires a protected target case, but the test checks a protected move destination instead of following a moved link into a protected target. Severity: 4/10

Existing Risk: 4/10 - A regression in the destination-relative target check could allow access to a protected file without the promised test detecting it.

Proposal Risk: 1/10 - An explicit target case detects regressions in this covered path while other policy checks still require their existing tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "cover moved symbolic links resolving into protected targets". Extend src/file-patch/sections.test.ts with an initially permitted relative symlink whose unchanged text resolves into a protected path after moving it, then assert a later content update fails with Protected file; retain the existing outside-workspace, missing-target and protected-destination checks. Run the diff-scoped checks.
