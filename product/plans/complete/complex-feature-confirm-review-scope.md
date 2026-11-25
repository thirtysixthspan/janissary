# Stop the complex-feature workflow when a focused or resolution review falls back to aggregate scope

**Complexity: 3/10** — 9 behavioral requirements, ~4 added playbook lines in 1 task file, 4 test scenarios (p=4.44)

## Goal

The review task now falls back to a full aggregate review whenever a scope it was handed can't be used, and it says so only in its report's `Scope:` line. `build-a-complex-feature.md` Step 6 passes `scope: commit` and `scope: range` but never reads that line. So one stale SHA, such as an implementation commit recorded before Step 5's rebase-and-retry rewrote it, turns a focused cycle into a full-PR review. Its plan and description findings would then cover subplans not yet implemented, and Step 6 would work every one of them as a repair. This plan makes Step 6 confirm each focused and resolution review ran in the scope it asked for before working that review's findings, and stop as blocked when it didn't. It also makes Step 5 read the implementation commit SHA after the push succeeds, so a rebase can't leave a stale one behind.

## Requirements

1. After the focused review in Step 6 item 1, the orchestrator reads the review's Step 7 `Scope:` report line before working any of its entries, per the entry's proposal "require the orchestrator to read the review subagent's Step 7 report and confirm its `Scope:` line".
2. The focused review's `Scope:` line must read `commit <short-sha>` naming the implementation commit, per "reads `commit <short-sha>` matching the implementation commit (item 1)".
3. After the resolution review in Step 6 item 4, the orchestrator reads that review's `Scope:` line before working any of its entries, per the same proposal sentence.
4. The resolution review's `Scope:` line must read `range <base>..<head>` naming the recorded range, per "`range <base>..<head>` matching the recorded range (item 4)".
5. A `Scope:` line that reads `aggregate — requested "<value>" ignored`, or otherwise doesn't match, makes the review blocked under Step 6's existing "If a review or repair is blocked" paragraph, per "treat the review as blocked under Step 6's existing "If a review or repair is blocked" paragraph".
6. A review blocked this way has none of its entries worked, per "rather than working its entries".
7. A review blocked this way leaves the PR and its outstanding backlog preserved and reports the blocker, per "preserving the PR and outstanding backlog, reporting the blocker".
8. Step 5 states that the implementation commit SHA handed to Step 6 item 1 is read with `git rev-parse HEAD` after the push succeeds, per "In Step 5 of the same file, state that the implementation commit SHA handed to Step 6 item 1 is read with `git rev-parse HEAD` after the push succeeds".
9. `scripts/review-pull-request-scope.test.mjs` asserts that `build-a-complex-feature.md` names the `Scope:` check, per "Add an assertion to scripts/review-pull-request-scope.test.mjs that build-a-complex-feature.md names the `Scope:` check".

## Design decisions

- The check lives in Step 6 items 1 and 4 themselves, the two places that hand a scope to the review, rather than in a new item. That keeps Step 6's numbering and its "skip to item 6" and "repeat items 2 through 4" references valid (Assumption 7). Because item 5 repeats item 4, every later resolution review gets the same check without more prose.
- A mismatch routes to the existing blocked paragraph under Step 6 (Existing functionality 1) instead of a new stop rule. That paragraph already preserves the PR and backlog, reports, and stops before the next subplan.
- The check treats any `Scope:` value other than the requested one as blocked, not only the fallback form. A review that ran in some other narrow scope would be just as wrong for the cycle, and the fallback form is the only other value the review's template allows (Assumption 4).
- A short SHA in the report matches when it is a prefix of the implementation commit SHA, since the review prints `commit <short-sha>` while Step 6 item 1 passes whatever SHA Step 5 recorded (Assumption 4).
- The review task's fallback in `ai/tasks/feature/review-pull-request.md` stays as it is, because its plan settled on falling back rather than stopping (Assumption 3). The caller that needs a narrow scope is the one that enforces it.
- Step 5 reads the SHA with `git rev-parse HEAD` after the push succeeds, because the bounded rebase-and-retry policy (Assumption 5) rewrites the local commit before a retry, and only the commit that reached the remote is reviewable (Assumption 6).

## Preserved behavior

1. The complex-feature workflow passes scopes as arguments, not override prose. Negative assertion: the edit must not drop the literal `scope: commit <implementation commit SHA>` or `scope: range <recorded head SHA>..<current PR head SHA>` argument text from Step 6 items 1 and 4, and must not reintroduce "Override its Step 2 and Step 3 review scope". Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
2. A wrong change-set statistic in the description is proposed for removal rather than correction. Negative assertion: no edit may change `ai/tasks/feature/review-pull-request.md`, which carries "the proposal removes the claim rather than correcting it". Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. Step 6 item 1 passes the implementation commit as a commit scope, at `ai/tasks/feature/build-a-complex-feature.md:83` "`scope: commit <implementation commit SHA>`".
2. Step 6 item 4 passes the repair range as a range scope, at `ai/tasks/feature/build-a-complex-feature.md:86` "`scope: range <recorded head SHA>..<current PR head SHA>`".
3. The review falls back rather than stopping on an unusable scope, at `ai/tasks/feature/review-pull-request.md:61` "Each one falls back to `aggregate` scope rather than stopping the review".
4. The review's report names its effective scope in one line with a fixed set of forms, at `ai/tasks/feature/review-pull-request.md:310` "Scope:          aggregate | commit <short-sha> | range <base>..<head> | aggregate — requested \"<value>\" ignored".
5. Step 5 retries a rejected push by rebasing, at `ai/tasks/feature/build-a-complex-feature.md:75` "If the remote advanced, use the repository's bounded rebase-and-retry policy".
6. A commit scope is valid only for a commit on the pull request's branch, at `ai/tasks/feature/review-pull-request.md:66` "For `commit`: the commit is not in `origin/master..HEAD`".
7. Step 6's internal references name item numbers, at `ai/tasks/feature/build-a-complex-feature.md:84` "skip to item 6" and `ai/tasks/feature/build-a-complex-feature.md:87` "repeat items 2 through 4".
8. A fallen-back review judges description and plan fidelity, which a focused review never does, at `ai/tasks/feature/review-pull-request.md:120` "Description fidelity and plan fidelity run only in `aggregate` scope."
9. The server test project collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'".

## Existing functionality

1. Step 6's blocked rule, at `ai/tasks/feature/build-a-complex-feature.md:90` "If a review or repair is blocked, preserve the PR and outstanding backlog, report the blocker, and stop rather than starting the next subplan."
2. The playbook-wording assertions for the complex-feature workflow, at `scripts/review-pull-request-scope.test.mjs:39` "is passed by the complex-feature workflow instead of override prose".
3. The spec's description of the staged focused and resolution reviews, at `product/specs/pull-request-review.md:31` "its review uses the commit scope and covers only that commit".

## Implementation steps

All three steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/build-a-complex-feature.md` Step 5, add one sentence saying the implementation commit SHA handed to Step 6 item 1 is read with `git rev-parse HEAD` after the push succeeds, so a rebase-and-retry can't leave a stale SHA behind.
2. In Step 6 item 1, after the delegation sentence and before the item ends, require the orchestrator to read the review's Step 7 report and confirm its `Scope:` line reads `commit <short-sha>` with that short SHA a prefix of the implementation commit SHA. Any other value, including `aggregate — requested "<value>" ignored`, means the review is blocked under the paragraph after the list, and none of its entries is worked. In Step 6 item 4, add the same check for `range <base>..<head>` naming the recorded head SHA and the current PR head SHA, pointing back to item 1's handling. Leave both `scope:` argument strings, the item numbering, and the blocked paragraph unchanged.
3. In `scripts/review-pull-request-scope.test.mjs`, add one `it` in the existing `describe` that reads `build-a-complex-feature.md` and asserts it names the `Scope:` check for both reviews, the fallback value it blocks on, and the `git rev-parse HEAD` read in Step 5.

## UI design

None. The change edits an agent playbook and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. Per the entry's proposal, `scripts/review-pull-request-scope.test.mjs` gains one assertion that `build-a-complex-feature.md` contains the `Scope:` check wording for the focused and resolution reviews, the `aggregate — requested "<value>" ignored` value, and the `git rev-parse HEAD` read after the push (Requirements 1 to 9). Its existing assertions and `scripts/pr-description-statistics-guideline.test.mjs` keep passing (Preserved behavior 1 and 2). No test can exercise the orchestrator actually reading a report, so Verification checks Step 6 by reading it.

## Out of scope

- `ai/tasks/feature/review-pull-request.md`, including its fallback behavior and report template, is unchanged.
- The Step 8 full review is unchanged. It requests `aggregate`, so a fallback can't change what it reviews.
- What to do with entries a fallen-back review already committed is left to the human. They stay in the backlog with the blocker reported.
- The other backlog entries on this PR are not touched.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs`, including the new assertion, and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read `ai/tasks/feature/build-a-complex-feature.md` Step 5 and confirm it says the implementation commit SHA is read with `git rev-parse HEAD` after the push succeeds.
3. Read Step 6 end to end. Confirm item 1 requires a `Scope:` line of `commit <short-sha>` matching the implementation commit before item 2 reads the backlog, item 4 requires `range <base>..<head>` matching the recorded range, both send any other value to the blocked paragraph with no entries worked, item 5 still repeats items 2 through 4, item 2 still skips to item 6, and the blocked paragraph is unchanged. A failure looks like a check that only fires on the fallback text, a check placed after the backlog is read, or a changed `scope:` argument string.
