<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reconcile the completed plan's "no guard flag is needed" design decision with the settled guard the implementation uses.

Existing Issue: The plan's Design decisions state that a promise settles once so a later `resolve` is a no-op and no guard flag is needed, while `runCheck` in `scripts/check-diff.mjs` carries a `settled` flag that returns early before printing because `settle` calls `printFailure` before `resolve`. Severity: 2/10

Existing Risk: 3/10 - A future agent treating the completed plan as the design record copies the no-guard assumption into another spawn-based runner, whose failure block is then printed twice when a failed spawn emits both `error` and `close`.

Proposal Risk: 1/10 - The plan of record explains why the guard exists, so the double-print hazard stays suppressed and the reader sees the real mechanism.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2209 "update the completed plan's no-guard design decision to match the implementation's settled guard". In `product/plans/complete/check-diff-concurrency-and-failure-output.md`, edit the second Design decisions bullet: keep the statement that a `close` following an `error` is ignored so a check that could not start is reported as such, but replace the claim that no guard flag is needed with an explanation that `settle` prints the failure block before resolving, so a `settled` flag is required to stop the later `close` from printing that block a second time. Leave `scripts/check-diff.mjs` unchanged — its guard is correct — and confirm the paragraph still matches the `error` and `close` handlers and the `printFailure` call. No automated test covers this path, so verify by reading `runCheck` against the edited paragraph rather than by running tooling.
