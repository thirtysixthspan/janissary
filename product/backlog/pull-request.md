<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Clean up a system shell tab created by a command that ultimately fails.

Existing Issue: When the shell command creates a valid `system` tab and then returns a rejected or failed outcome, `SystemShellManager.ensureShell()` reports failure but leaves that tab visible and without managed system-shell identity. Severity: 5/10

Existing Risk: 4/10 - A partial failure can leave an unexpected shell and PTY in the user's tab strip, while startup reports that system-shell creation failed.

Proposal Risk: 2/10 - Removing the attempt-owned tab on every non-success outcome prevents an unowned shell from remaining, while checking its attempt identity protects pre-existing tabs.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "close an attempt-owned system shell when its command fails". In `src/system-shell.ts`, update `SystemShellManager.ensureShell()` to close the `opened` tab whenever `runCommandResult()` returns `rejected` or `failed`, regardless of whether `liveShellPtyId()` considers it valid; keep the existing captured-before set and label check so cleanup cannot affect a pre-existing tab. Preserve the original rejection or failure reason in the returned failure and notification. Add a case in `src/system-shell.test.ts` where the plugin command opens a valid shell tab and then returns a rejected or failed outcome, and assert that the created tab and its local PTY are cleaned up, one notice carries the original reason, and the `janus` tab remains. Retain the existing invalid-attempt cleanup, pre-existing-label protection, and failure-reason tests.
