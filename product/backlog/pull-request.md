<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct shell-exit routing so shell tabs receive the remote-shell termination message.

Existing Issue: `SessionRouter.exit` sets the callback's harness flag for a shell spawn, so `terminateRemoteProcess` reports the exit as a remote harness termination. Severity: 5/10

Existing Risk: 5/10 - A remote shell that exits is labeled as a harness in the tab transcript and notification, which misleads users about which process ended.

Proposal Risk: 1/10 - Keeping the process kind separate from the harness flag makes the existing shell termination wording apply, with a focused routing test to prevent regression.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1577: report remote shell exits as shell terminations". In `src/remote/channel/sessions.ts`, keep shell processes in the `onSessionExit` condition so they still reach termination cleanup, but pass `spawned.harness !== undefined` as the callback's harness argument without OR-ing in `spawned.shell`. Add or adjust a `SessionRouter` test in `src/remote/channel/sessions.test.ts` to assert a shell exit calls `onSessionExit` with no per-process owner label and `harness` false, while preserving the existing harness-exit assertion if present; the entry factory falls back to the launch label for this standalone shell. Verify that `terminateRemoteProcess` therefore selects its existing `Remote shell` wording and run `./scripts/run.mjs check-diff`; this small branching behavior currently has no test that checks the message classification.
