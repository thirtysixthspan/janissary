<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that the script is already long enough to need the 200-line exemption.

Existing Issue: The description says the script is now long enough that `scripts/**/*.mjs` is exempt from the 200-line rule, but `scripts/check-diff.mjs` is 158 lines and the exemption was added so the file may grow past 200, not because it already has. Severity: 2/10

Existing Risk: 2/10 - A reader takes the exemption as justified by the current size and strips it once the file is trimmed, or assumes the rule is relaxed for other scripts for the same reason.

Proposal Risk: 1/10 - The description states the exemption and its forward-looking rationale without the false size claim, so no behavior changes and the proof is unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2209 "remove the description's claim that check-diff is already long enough for the line-limit exemption". In the pull request body's "What" section, rewrite the final sentence of that section so it says the runner is exempted from `max-lines` so it may grow past 200 lines, with the matching note in `ai/guidelines/code-guidelines.md` and the observable behavior described in `product/specs/testing.md`. Do not change `eslint.config.mjs`, `ai/guidelines/code-guidelines.md`, `scripts/check-diff.mjs`, or `product/specs/testing.md`: the exemption itself is intended and correct. The existing verification step that checks `max-lines` is off for `scripts/check-diff.mjs` and still `error` with `max: 200` for `src/commands.ts` remains the proof, so re-read the edited paragraph against those files to confirm no other claim drifts.


* Reconcile the completed plan's "no guard flag is needed" design decision with the settled guard the implementation uses.

Existing Issue: The plan's Design decisions state that a promise settles once so a later `resolve` is a no-op and no guard flag is needed, while `runCheck` in `scripts/check-diff.mjs` carries a `settled` flag that returns early before printing because `settle` calls `printFailure` before `resolve`. Severity: 2/10

Existing Risk: 3/10 - A future agent treating the completed plan as the design record copies the no-guard assumption into another spawn-based runner, whose failure block is then printed twice when a failed spawn emits both `error` and `close`.

Proposal Risk: 1/10 - The plan of record explains why the guard exists, so the double-print hazard stays suppressed and the reader sees the real mechanism.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2209 "update the completed plan's no-guard design decision to match the implementation's settled guard". In `product/plans/complete/check-diff-concurrency-and-failure-output.md`, edit the second Design decisions bullet: keep the statement that a `close` following an `error` is ignored so a check that could not start is reported as such, but replace the claim that no guard flag is needed with an explanation that `settle` prints the failure block before resolving, so a `settled` flag is required to stop the later `close` from printing that block a second time. Leave `scripts/check-diff.mjs` unchanged — its guard is correct — and confirm the paragraph still matches the `error` and `close` handlers and the `printFailure` call. No automated test covers this path, so verify by reading `runCheck` against the edited paragraph rather than by running tooling.
