# Work every subplan review finding before a resolution review

**Complexity: 2/10** — one step of one orchestration playbook, one spec paragraph, and a new pin test. No runtime surface.

## Goal

`ai/tasks/feature/build-a-complex-feature.md` Step 6 reviews each subplan's implementation commit, drains the findings, and then reviews each repair commit against the same subplan. Each repair gets its own review as it lands, so a second review can start while findings from the first are still waiting, and that second review judges the repair against the whole subplan instead of asking whether the finding was fixed.

Change the cycle so every finding the first focused review records is worked before any other review runs. The review that follows is a resolution review. It confirms each worked finding was resolved, and that the repairs didn't break what they touched. It doesn't review the subplan from scratch.

## Decisions

- The first focused review of the implementation commit stays as it is.
- Before draining, the orchestrator records each backlog entry's text and the PR head SHA. Each repair removes its entry from the backlog file, so the resolution reviewer can't read the entries from there afterward.
- Every entry is worked, one at a time in file order, before any further review. Nothing is reviewed between repairs.
- When the backlog is empty, a fresh subagent runs `review-pull-request.md` as a resolution review. It gets the PR number, the subplan path, the recorded entries, and the repair range from the recorded SHA to the current head. Its promises are the recorded entries and the fix plans the repairs added in that range. For each one, it confirms the repair resolved it as proposed. It reviews only the repair range's diff, and only for regressions or new defects those repairs introduced. It doesn't re-review the original implementation commit, earlier subplans, or the aggregate PR.
- An unresolved entry or a regression from a repair is recorded as a new backlog entry. The cycle then repeats: record the entries and head SHA, drain everything, and run another resolution review scoped to the new repair range and the new entries.
- The cycle finishes when the first focused review records nothing, or when a resolution review records nothing and the backlog is empty.
- The review task keeps its clean-tree, deduplication, no-fix, no-tooling, backlog-only commit, and open-PR rules. Its scope is overridden only in this step, so its standalone contract doesn't change.

## Implementation steps

1. `ai/tasks/feature/build-a-complex-feature.md`:
   - Opening paragraph and the `Orchestration rules` bullet on subplan reviews: name the work-all-findings-then-resolution-review order.
   - Step 6: keep item 1, the focused review. Replace items 2 and 3 with: record the entries and head SHA, drain every entry before any further review, run the resolution review with the override described above, and repeat until a resolution review records nothing and the backlog is empty. Keep the final confirmation item and the blocked-condition paragraph.
   - Step 7's precondition sentence: name the resolution review alongside the focused review.
   - Step 10's report: count resolution reviews on the `Reviews:` line.
2. `product/specs/pull-request-review.md`, `### Staged reviews for complex features`: describe the drain-all-then-resolution-review order for subplan findings.
3. `scripts/build-a-complex-feature-review-cycle.test.mjs`: a new pin test (see Tests).

## Tests

`scripts/build-a-complex-feature-review-cycle.test.mjs`, a new file in the style of `scripts/build-a-complex-feature-playbook.test.mjs`. It pins only the wording the new cycle depends on:

- Step 6 records the entries and the head SHA before draining.
- Step 6 works every entry before any further review.
- Step 6 runs a resolution review scoped to the recorded entries, their fix plans, and the repair range, and excludes re-reviewing the implementation commit.
- Step 6 repeats until a resolution review records no new findings and the backlog is empty.
- Step 6 no longer reviews each repair commit as it lands.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: read Step 6 and confirm no review runs while any entry from the previous review remains, that the follow-up review is limited to confirming resolution and checking the repairs for regressions, and that the cycle has a defined end.

## Out of scope

- Step 8's full-PR review cycle. It already drains every finding before the next full review, and the request covers Step 6 only.
- Changes to `review-pull-request.md`, `work-pull-request-issue.md`, or any other child task.
- Bounding the number of resolution rounds. The other review cycles aren't bounded either.
- `help/` and `documentation/user-documentation/`. The pull-request review workflow page says only that each subplan commit gets a focused review first, which stays true.
