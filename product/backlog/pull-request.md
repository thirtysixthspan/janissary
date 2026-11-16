<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the moved link's protected target policy.

Existing Issue: The moved-link fix plan requires a protected target case, but the test checks a protected move destination instead of following a moved link into a protected target. Severity: 4/10

Existing Risk: 4/10 - A regression in the destination-relative target check could allow access to a protected file without the promised test detecting it.

Proposal Risk: 1/10 - An explicit target case detects regressions in this covered path while other policy checks still require their existing tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "cover moved symbolic links resolving into protected targets". Extend src/file-patch/sections.test.ts with an initially permitted relative symlink whose unchanged text resolves into a protected path after moving it, then assert a later content update fails with Protected file; retain the existing outside-workspace, missing-target and protected-destination checks. Run the diff-scoped checks.
