<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the plan's remote termination busy-owner cleanup.

Existing Issue: Remote session termination now clears all tab busy owners through `TabManager.clearBusy`, but the remote termination tests do not assert that active owner tokens are removed. Severity: 3/10

Existing Risk: 3/10 - A later change could omit the clear call and leave a terminated remote tab's busy dot lit until the tab closes, while the runtime helper's unit test would still pass.

Proposal Risk: 1/10 - A remote termination test would pin the manager-to-runtime cleanup path, though unrelated remote teardown failures could still leave work active.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "test remote termination clearing busy owners". In `src/remote/attach.test.ts`, extend the existing remote termination fixture or add a focused case with a tab whose runtime has separate shell and ACP owners and is busy. Wire the fixture's `TabManager.clearBusy` to the production `runtimeOperations.clearBusy` helper, trigger the remote termination frame, and assert the tab becomes idle and its owner set is empty. Release an old owner afterward and confirm it does not restore busy state; retain the existing runtime clear test and remote notification coverage.
