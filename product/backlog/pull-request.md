<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Validate clone prerequisites before deleting a leftover workspace.

Existing Issue: Both the local launch resolver and remote provisioner remove and announce a leftover before `WorkspaceManager.create` checks whether the project has a repository and an `origin` remote, and a trust-file write failure after removal is outside the cleanup error handler. Severity: 8/10

Existing Risk: 8/10 - A launch that cannot clone can still erase uncommitted work from the leftover, and a failed trust update can leave the folder gone without the promised refusal or cleanup notice.

Proposal Risk: 3/10 - Preflight and cleanup error handling reduce avoidable loss, although a clone that fails after deletion can still leave the prior workspace unrecoverable under the plan's automatic cleanup policy.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1175: validate clone prerequisites before leftover deletion". Separate the repository and `origin` validation in `src/workspace/manager.ts` from starting the clone, and call that preflight before cleanup in `src/launch-name/local.ts` and `src/remote/serve-provision.ts`, keeping the existing launch error behavior when preflight fails. In `src/launch-name/leftover.ts`, include `untrustWorkspace` failures in the reported cleanup error path and avoid announcing success until the full cleanup completes; decide and document how a partially removed folder is reported. Add tests in `src/profile/manager.test.ts`, `src/harness/manager.test.ts`, and `src/remote/serve.test.ts` with a leftover and a missing `origin`, asserting the old files survive and no cleanup notice is posted, plus a trust-write failure case in `src/launch-name/leftover.test.ts`.
