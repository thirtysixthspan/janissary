<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Confine launch labels before automatic leftover cleanup can remove a directory outside the workspace base.

Existing Issue: The new cleanup passes a typed harness label or a remote provision frame's label directly into `workspacePath` and then recursively removes the resulting path, while those inputs can contain `..` and path separators. Severity: 10/10

Existing Risk: 10/10 - A launch such as a `-w` harness with a traversal label can delete an existing project directory or other data outside `.janissary/workspace` before cloning fails.

Proposal Risk: 2/10 - A shared containment check guards the deletion paths, though future workspace operations still need to use that guard consistently.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1175: confine launch labels before leftover cleanup". Validate or safely resolve each label as one workspace child before any existence check or removal in `src/launch-name/leftover.ts` and `src/launch-name/local.ts`, and reject invalid labels at `src/remote/frame-decode.ts` or `src/remote/serve-provision.ts` before they reach that helper; preserve ordinary display labels where no workspace path is created. Ensure both the command path in `src/harness/command-parse.ts` and profile harness names in `src/profile/entry-openers.ts` reach the same guard, and have invalid local launches report a refusal without deleting or cloning. Add cases in `src/launch-name/leftover.test.ts`, `src/harness/manager.test.ts`, and `src/remote/serve.test.ts` that place a sentinel outside the workspace base and verify traversal labels cannot remove it; keep the existing ordinary-leftover tests passing.


* Preserve a live remote workspace when its requested label differs only by case.

Existing Issue: The local collision check compares labels without case, but `hasLivePeer` in the remote workspace check compares the recorded label with strict equality before removing a folder that appears to be leftover. Severity: 9/10

Existing Risk: 9/10 - On a case-insensitive host, a second Janissary instance can launch `Foo` while a live peer owns `foo`, causing cleanup to remove the live peer's workspace and interrupt its process.

Proposal Risk: 2/10 - Matching peer labels consistently prevents the known collision, while filesystem-specific aliasing beyond case remains a separate concern.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1175: protect live remote workspaces across case-only label changes". Make `src/launch-name/leftover.ts` compare live peer labels with the same case-insensitive rule used by `src/launch-name/check.ts`, and apply that rule to the open-tab workspace predicate used by `src/launch-name/local.ts` where paths can alias on the host filesystem. Before `src/remote/serve-provision.ts` removes any existing directory, ensure a peer owning a case variant causes `name-in-use` rather than cleanup. Extend `src/launch-name/leftover.test.ts` and `src/remote/serve.test.ts` with a live peer recorded as `foo` and a requested `Foo`, asserting the workspace contents remain intact; retain the dead-peer cleanup case.


* Validate clone prerequisites before deleting a leftover workspace.

Existing Issue: Both the local launch resolver and remote provisioner remove and announce a leftover before `WorkspaceManager.create` checks whether the project has a repository and an `origin` remote, and a trust-file write failure after removal is outside the cleanup error handler. Severity: 8/10

Existing Risk: 8/10 - A launch that cannot clone can still erase uncommitted work from the leftover, and a failed trust update can leave the folder gone without the promised refusal or cleanup notice.

Proposal Risk: 3/10 - Preflight and cleanup error handling reduce avoidable loss, although a clone that fails after deletion can still leave the prior workspace unrecoverable under the plan's automatic cleanup policy.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1175: validate clone prerequisites before leftover deletion". Separate the repository and `origin` validation in `src/workspace/manager.ts` from starting the clone, and call that preflight before cleanup in `src/launch-name/local.ts` and `src/remote/serve-provision.ts`, keeping the existing launch error behavior when preflight fails. In `src/launch-name/leftover.ts`, include `untrustWorkspace` failures in the reported cleanup error path and avoid announcing success until the full cleanup completes; decide and document how a partially removed folder is reported. Add tests in `src/profile/manager.test.ts`, `src/harness/manager.test.ts`, and `src/remote/serve.test.ts` with a leftover and a missing `origin`, asserting the old files survive and no cleanup notice is posted, plus a trust-write failure case in `src/launch-name/leftover.test.ts`.
