<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pin the close-reason text in the remote edit settlement test, which the plan names but the test leaves unasserted.

Existing Issue: The plan's test list says close, connection end, and timeout each resolve as failure values with the named reasons, but the close case in `resolves an edit as a failure value on close, connection end, and timeout` asserts only `{ ok: false }` and never checks `The remote file navigator is closed.` Severity: 2/10

Existing Risk: 2/10 - A change to how a closed navigator settles an edit, such as an empty or wrong reason reaching the agent, would pass the test unnoticed.

Proposal Risk: 1/10 - The assertion then matches the plan exactly; the only remaining exposure is the shared `CLOSED_REASON` constant changing, which the import would track.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "assert the closed-navigator reason in the remote editFile settlement test". In `src/file-navigator/remote/port.test.ts`, change the close branch of `resolves an edit as a failure value on close, connection end, and timeout` from `toMatchObject({ ok: false })` to `toEqual({ ok: false, reason: CLOSED_REASON })`, importing `CLOSED_REASON` from `src/file-navigator/remote/port-requests.ts`; if the harness's `onClose` settles with a different reason, record that discrepancy rather than weakening the assertion. Run the server tests for that file and confirm its other cases stay green.
