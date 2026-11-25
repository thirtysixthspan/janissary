# Give review-pull-request.md an explicit scope parameter

**Complexity: 6/10** — 26 behavioral requirements across ~60 added playbook lines in 3 task files, 10 test scenarios (p=6.27)

## Goal

`review-pull-request.md` always reviews the whole pull request. Its Step 2 finds the own plan from the branch's first commit and treats every other plan added under `product/plans/complete/` as a fix plan, and its Step 3 reviews `git diff origin/master...HEAD`. The staged complex-feature workflow needs narrower reviews, so every caller that wants one restates the narrowing as override prose. The feature text puts it this way: "all five subplan reviews needed overrides to suppress that discovery and narrow to one commit. A scope: commit <sha> | aggregate argument would remove the override prose." This plan gives the review task an optional `scope:` argument with three values, `commit`, `range`, and `aggregate`, so a caller names the scope instead of rewriting the task's Step 2 and Step 3.

## Requirements

1. The review task accepts an optional `scope:` argument after the pull request reference, per the feature text "A scope: commit <sha> | aggregate argument" and the settled answer "optional that defaults to full scope".
2. `scope: commit <sha>` limits the review to the diff of that one commit against its parent, per the settled answer "commit, range, aggregate".
3. `scope: range <base>..<head>` limits the review to the diff from `<base>` to `<head>`, per the settled answer "commit, range, aggregate".
4. `scope: aggregate` reviews the full pull request, per the settled answer "commit, range, aggregate".
5. An invocation with no `scope:` argument reviews the full pull request, per the settled answer "optional that defaults to full scope".
6. In aggregate scope, the review finds its own plan from the branch's first commit, per the settled answer "Aggregate keeps first-commit discovery".
7. In commit and range scopes, the review reads no plan, per the settled answer "commit and range read no plan".
8. In commit and range scopes, the review collects no fix plans, per the settled answer "no fix-plan collection run".
9. In commit and range scopes, the review builds no promise list, per the settled answer "remove the promises, just review the commits".
10. In commit and range scopes, the review judges functionality gaps, technical debt, and security only, per the settled answer "Functionality gaps, technical debt, and security only" and "1, same for commit scope".
11. A `scope:` argument with an unknown keyword falls back to aggregate scope, per the settled answer "Fall back to aggregate".
12. `scope: commit` with no SHA falls back to aggregate scope, per the settled answer "Fall back to aggregate".
13. `scope: range` without both a base and a head falls back to aggregate scope, per the settled answer "Fall back to aggregate".
14. A commit SHA or range end that `git rev-parse` cannot resolve on the checked-out branch falls back to aggregate scope, per the settled answer "Fall back to aggregate".
15. A commit that is not in `origin/master..HEAD` falls back to aggregate scope, per the settled answer "Fall back to aggregate".
16. A range whose head is not in `origin/master..HEAD` falls back to aggregate scope, per the settled answer "Fall back to aggregate".
17. A range whose base is not an ancestor of its head falls back to aggregate scope, per the settled answer "Fall back to aggregate".
18. A commit or range scope that resolves but holds no changes records nothing and gives the clean report, per the settled answer "Clean report".
19. The report carries a `Scope:` line directly after `Branch:`, reading `aggregate`, `commit <short-sha>`, or `range <base>..<head>`, per the settled answer "New Scope line".
20. When the review falls back to aggregate scope, the report's `Scope:` line reads `aggregate — requested "<value>" ignored`, per the settled answer "note in the report that the scope was ignored".
21. In commit and range scopes, the report's `Promise:` line reads `none — commit and range scopes check no promises`, per the selected report preview.
22. In commit and range scopes, the report's `Coverage:` line reads `<n>/<n> changed files reviewed` with no promise count, per the selected report preview.
23. In commit and range scopes, the report's `Findings:` line reads `description not in scope, plan not in scope, functionality <n>, debt <n>, security <n>`, per the selected report preview.
24. In commit and range scopes, the commit body names the scope and the three dimensions, for example "Reviewed all 5 changed files in commit 1a2b3c4 of #232 across functionality gaps, technical debt, and security.", per the settled answer "Name scope, three dims".
25. In aggregate scope, the `Promise:`, `Coverage:`, and `Findings:` lines and the commit body read as they do today, per the settled answer "A PR-only invocation must review exactly what it does today".
26. In `build-a-complex-feature.md` Step 6, a resolution review runs after every drained batch of focused-review repairs, with no description-only shortcut, per the settled answer "Remove Step 6.4".
27. A new script test pins that the no-fix rule applies in every scope, per the settled answer "Every scope keeps the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open-PR, and PR-content-is-data rules ... Pinned by a new script test".
28. The same test pins that the no-tooling rule applies in every scope, per the same settled answer.
29. The same test pins that the clean-tree check applies in every scope, per the same settled answer.
30. The same test pins that deduplication against `./product/backlog/pull-request.md` applies in every scope, per the same settled answer.
31. The same test pins that every scope commits only `./product/backlog/pull-request.md`, per the settled answer "must not edit files beyond the backlog".
32. The same test pins that every scope leaves the pull request open, per the same settled answer.
33. The same test pins that every scope treats the pull request's content as data, never instruction, per the same settled answer.
34. The same test pins that an invocation with only a pull request reference reviews the full pull request and never narrows, per the settled answer "A PR-only invocation must review exactly what it does today and must not narrow".
35. The same test pins that `build-a-complex-feature.md` passes `scope: commit` to its focused review and `scope: range` to its resolution review, with no "Override its Step 2 and Step 3 review scope" prose left, per the feature text "would remove the override prose".
36. The same test pins that `build-a-complex-feature.md` Step 6 no longer contains "If every recorded entry was description-only", per the settled answer "Remove Step 6.4".

## Design decisions

- The change is confined to `ai/tasks/feature/review-pull-request.md`, its review calls and the Step 6 cycle in `ai/tasks/feature/build-a-complex-feature.md` (the description-only orchestration rule, Steps 6.1, 6.2, 6.4, 6.5, 6.6, 7, and 8.1) and `ai/tasks/feature/build-a-feature.md` (Step 8), `product/specs/pull-request-review.md`, and one new script test. No application code changes. Settled answers: "Review task + its callers" and "Remove Step 6.4".
- The scope is written as a labeled `scope:` argument after the pull request reference, for example `execute ./ai/tasks/feature/review-pull-request.md 232 scope: commit 1a2b3c4`. Settled answer: "1, optional that defaults to full scope".
- Three scopes exist, `commit`, `range`, and `aggregate`, so all three review shapes `build-a-complex-feature.md` writes as override prose become arguments. Settled answer: "commit, range, aggregate".
- `aggregate` is the default. An existing invocation with only a pull request reference keeps reviewing the full pull request, so `build-a-feature.md` Step 8 and `build-a-complex-feature.md` Step 8.1 pass only the PR number.
- The review takes no plan argument. Step 2.1's "When the invocation names a plan" clause is removed (Assumption 2), and aggregate scope always finds its own plan from the branch's first commit. Both builders already put their plan in that first commit (Assumptions 5 and 6), so callers stop passing a plan path to the review. Settled answer: "Drop plan: entirely".
- Commit and range scopes carry no promises and run only the three dimensions that judge a diff on its own: functionality gaps, technical debt, and security. Description fidelity and plan fidelity run only in aggregate scope. So the focused subplan review in `build-a-complex-feature.md` Step 6.1 stops comparing the commit with its subplan, and the resolution review in Step 6.5 stops checking each recorded entry against its proposal and reviews only the repair commits. Settled answers: "remove the promises, just review the commits" and "1, same for commit scope".
- Because commit and range scopes read no plan, Step 3's "Out of scope" drop rule for functionality gaps applies only in aggregate scope.
- Commit scope diffs the commit against its first parent, `git diff <sha>^ <sha>`, matching the existing override's "the implementation commit's diff against its parent" (Existing functionality 1). Range scope diffs `git diff <base>..<head>`, so `<base>` itself is excluded, matching the existing "repair range from the recorded head SHA to the current PR head" (Existing functionality 2).
- An unusable scope never stops the review. It falls back to aggregate scope and the report says so. SHAs can only be resolved once the branch is checked out, so the scope is read in Step 0 and validated after Step 1's checkout and pull. Settled answer: "Fall back to aggregate".
- `build-a-complex-feature.md` Step 6.4, the description-only shortcut that skips the resolution review, is removed. Commit and range reviews run no description fidelity, so their findings are almost never description-only and the shortcut becomes a path the workflow never takes (architecture principle 5, `ai/guidelines/architecture-principles.md` "No code path that the system never takes"). Step 6.2 then stops recording each entry's full text and classifying it, since the resolution review no longer reads the entries (Assumption 8) and Step 6.4 was the only other reader (Assumption 7). It keeps recording the PR head SHA, because that SHA is the base of the resolution review's `scope: range`. The orchestration rule at the top of the task that defines the description-only exception is narrowed to the full-PR review in Step 8, where Step 8.3 keeps using it. Settled answer: "Remove Step 6.4".

## Preserved behavior

1. A wrong change-set statistic in the description is proposed for removal rather than correction. Negative assertion: no scope change may drop or reword the sentence "the proposal removes the claim rather than correcting it" from `ai/tasks/feature/review-pull-request.md`. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. A review invoked with only a pull request reference reviews the full pull request today, at `ai/tasks/feature/review-pull-request.md:44` "that value is the target".
2. Own-plan discovery skips its lookup when the invocation names a plan, at `ai/tasks/feature/review-pull-request.md:69` "When the invocation names a plan".
3. Every added plan under `product/plans/complete/` other than the own plan is a fix plan, at `ai/tasks/feature/review-pull-request.md:70` "Every `A` line under `product/plans/complete/` other than the own plan is a fix plan".
4. The three-dot aggregate diff is the review's only diff today, at `ai/tasks/feature/review-pull-request.md:95` "`git diff origin/master...HEAD`, with three dots, is the authoritative diff throughout".
5. The ordinary feature build's plan is in the PR's first commit, at `ai/tasks/feature/build-a-feature.md:127` "the plan promoted in Step 6 is in the PR's first commit, which is how it finds the PR's own plan".
6. The complex-feature build's source plan is in the PR's first commit, at `ai/tasks/feature/build-a-complex-feature.md:114` "Its Step 3 plan discovery finds the canonical plan from the branch's first commit".
7. Step 6.4 of the complex-feature build is the only Step 6 reader of the recorded classification, at `ai/tasks/feature/build-a-complex-feature.md:86` "If every recorded entry was description-only".
8. Step 6.2 of the complex-feature build justifies recording entries by the resolution review's need for them, at `ai/tasks/feature/build-a-complex-feature.md:84` "this record is the only place the resolution review can find what was promised".
9. The review's Allowed list names the read-only git commands it may run and does not include `git rev-parse` or `git merge-base`, at `ai/tasks/feature/review-pull-request.md:25` "Run read-only `git` and `gh` commands (`git diff`, `git log`, `git show`, `git status`, `gh pr view`, `gh pr diff`)".
10. The server test project already collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'", and `npm run test:diff:server` runs it with `--changed`, at `package.json:46` "vitest run --project server --changed".
11. The orchestration rule defining the description-only exception names the resolution review among the reviews it skips, at `ai/tasks/feature/build-a-complex-feature.md:22` "no resolution review, partial review, or full re-review runs to check description corrections".
12. Step 6.6 repeats a numbered range of items and ends the cycle on the description-only shortcut, at `ai/tasks/feature/build-a-complex-feature.md:88` "repeat items 2 through 5" and "The cycle also ends when every entry a resolution review recorded was description-only".
13. Step 7 exempts description-only subplans from resolution review, at `ai/tasks/feature/build-a-complex-feature.md:95` "resolution-reviewed unless their last findings were all description-only".

## Existing functionality

1. The focused subplan review override, at `ai/tasks/feature/build-a-complex-feature.md:83` "Override its Step 2 and Step 3 review scope: read the improved subplan as the promise and review only the implementation commit's diff against its parent".
2. The resolution review override, at `ai/tasks/feature/build-a-complex-feature.md:87` "the promises are the recorded entries and the fix plans the repairs added in that range".
3. The aggregate review call in the complex-feature build, at `ai/tasks/feature/build-a-complex-feature.md:105` "Do not apply the focused-commit override; this is the first review of the aggregate PR diff".
4. The ordinary feature build's review call, at `ai/tasks/feature/build-a-feature.md:116` "Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent with the recorded PR number".
5. A precedent for an invocation line naming a pull request reference followed by an optional argument, at `ai/tasks/feature/work-pull-request-issue.md:7` "`<number|#number|PR URL> [work item]`".
6. The review's existing no-plan fallback, which judges against the description and commit subjects, at `ai/tasks/feature/review-pull-request.md:85` "If there is no own plan, don't stop".
7. The spec's statement of review scope, at `product/specs/pull-request-review.md:5` "a staged complex-feature review may be limited to one implementation commit and its subplan".
8. The spec's statement of the focused review, at `product/specs/pull-request-review.md:31` "its review is limited to that commit against the corresponding subplan".
9. The spec's statement of the resolution review, at `product/specs/pull-request-review.md:33` "It checks each resolved finding against what its entry proposed".
10. A precedent for pinning playbook wording with a script test, at `scripts/pr-description-statistics-guideline.test.mjs:45` "the proposal removes the claim rather than correcting it".

## Implementation steps

All eleven steps land together as one checkpoint and one commit, because the review task and its callers must agree at every commit: a caller passing `scope:` to a task that doesn't read it, or a task without the override its caller still relies on, would leave the playbooks contradicting each other. The checkpoint's build command, and the check that proves it green, is `$janissary/scripts/run.mjs check-diff`. No step depends on another plan landing first.

1. In `ai/tasks/feature/review-pull-request.md`, add an invocation line after the opening two paragraphs, in the style of `work-pull-request-issue.md` (Existing functionality 5): `execute ./ai/tasks/feature/review-pull-request.md <target> [scope: commit <sha> | scope: range <base>..<head> | scope: aggregate]`, with aggregate as the default. State in the same place that every rule in the "What you may and may not do" section applies in every scope. Add `git rev-parse` and `git merge-base` to the Allowed list's read-only git commands (Assumption 9).
2. In Step 0, read the `scope:` argument after the target and record the requested scope and its raw value. Do not validate SHAs here. Step 0's target rules are unchanged: the target is still the first value, and `scope:` never names a pull request.
3. In Step 1, after the clean-tree check in item 4, add an item that validates the requested scope against the checked-out branch with `git rev-parse --verify <sha>^{commit}` for each SHA and `git merge-base --is-ancestor` for each reachability rule, and applies the fallback rules from Requirements 11 to 17 in that order, stopping at the first that applies. Record the effective scope and, on fallback, the ignored raw value for Step 7.
4. In Step 2, remove the "When the invocation names a plan" clause from item 1. State that Step 2 runs only in aggregate scope; in commit and range scopes it is skipped and no promise list exists.
5. In Step 3, name the authoritative diff per scope: `origin/master...HEAD` for aggregate, `<sha>^ <sha>` for commit, `<base>..<head>` for range. The change list, per-file review, and file-status rules use that diff. State that the "Walk the promises" pass and the promise half of "Confirm coverage" run only in aggregate scope, that description fidelity and plan fidelity run only in aggregate scope, and that the "Out of scope" drop rule for functionality gaps applies only there.
6. In Step 5, add a scoped example commit body beside the existing one, matching Requirement 24.
7. In Step 7, add the `Scope:` line after `Branch:` and give the commit-and-range variants of the `Promise:`, `Coverage:`, and `Findings:` lines, matching Requirements 19 to 23.
8. In `ai/tasks/feature/build-a-complex-feature.md` Step 6.1, replace the override sentences with a call that passes the PR number and `scope: commit <implementation commit SHA>`, keeping the closing sentence that preserves the review task's clean-tree, deduplication, no-fix, no-tooling, backlog-only commit, and open-PR rules. Step 6.5 passes the PR number and `scope: range <recorded head SHA>..<current PR head SHA>`, and drops the recorded entries, the subplan path, the per-entry resolution check, and the list of what not to re-review. Step 6.2 keeps the empty-backlog skip and the PR head SHA record, and drops the full-text entry record, its reason (Assumption 8), and the classification. Step 6.4 is deleted and the later items renumber: Step 6.2's "skip to item 7" becomes "skip to item 6", the old Step 6.6 repeats "items 2 through 4" and drops its description-only ending sentence (Assumption 12). Step 7 drops "unless their last findings were all description-only" (Assumption 13). The orchestration rule at line 22 (Assumption 11) is narrowed so it names the full-PR review of Step 8 and no longer lists a resolution review or partial review among those it skips. Step 8.1 passes only the PR number and drops the "focused-commit override" sentence and the canonical source plan.
9. In `ai/tasks/feature/build-a-feature.md` Step 8, reword the opening paragraph's "giving it the recorded PR number and the completed plan path" so the review receives only the recorded PR number and each repair still receives both. Item 1 already passes only the PR number and stays as it is.
10. In `product/specs/pull-request-review.md`, update the "Review and recording" paragraph (Existing functionality 7) to describe the three scopes, the aggregate default, the fallback, and the three dimensions commit and range scopes judge. In "Staged reviews for complex features", rewrite the focused-review sentence (Existing functionality 8) so the review covers that one commit without comparing it to its subplan, and the resolution-review sentence (Existing functionality 9) so it reviews the repair commits for regressions and new defects without checking each finding against its entry. In the same paragraph, limit the "When every finding a review records asks only for a correction to the pull-request description" exception to the aggregate review, since focused cycles always run their resolution review. The "Review cycle after building a feature" paragraph stays as it is, since aggregate scope still reviews against the completed plan.
11. Add `scripts/review-pull-request-scope.test.mjs`, modeled on `scripts/pr-description-statistics-guideline.test.mjs` (Existing functionality 10), covering Requirements 27 to 36. It needs no config change, since the server test project already collects it (Assumption 10).

## Tests

`scripts/review-pull-request-scope.test.mjs` reads the playbooks as text, the same way `scripts/pr-description-statistics-guideline.test.mjs` does, and asserts:

- `review-pull-request.md` states that its rules apply in every scope, and still carries the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open-PR, and PR-content-is-data rules. Requirements 27 to 33.
- `review-pull-request.md` names aggregate as the default when no `scope:` is given. Requirement 34.
- `build-a-complex-feature.md` passes `scope: commit` and `scope: range` to the review and contains no "Override its Step 2 and Step 3 review scope". Requirement 35.
- `build-a-complex-feature.md` contains no "If every recorded entry was description-only". Requirement 36.

The existing `scripts/pr-description-statistics-guideline.test.mjs` keeps passing unchanged (Preserved behavior 1). Requirements 1 to 26 describe agent behavior that no test can exercise; Verification checks them by reading.

## Out of scope

Settled answer: "Review task + its callers".

- `ai/tasks/feature/test-pull-request.md`, `ai/tasks/feature/update-pull-request.md`, and `ai/tasks/feature/work-pull-request-issue.md` are unchanged and gain no scope argument.
- The backlog entry format, the issue severity scale, and the risk scale are unchanged.
- The cycle structure in `build-a-complex-feature.md` is unchanged beyond swapping override prose for arguments and removing Step 6.4: repairs one at a time in file order, the description-only shortcut in Step 8.3, the testing cycle's description-only retest rule, and repeating until a review adds no findings.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm the new test and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read `ai/tasks/feature/review-pull-request.md` and confirm: the invocation line lists the three scopes with aggregate as the default; Step 1 validates the scope and falls back to aggregate for each case in Requirements 11 to 17; Step 2 runs only in aggregate scope and no longer mentions a named plan; Step 3 names the diff for each scope and limits commit and range scopes to functionality gaps, technical debt, and security; Step 7 shows the `Scope:` line and the scoped `Promise:`, `Coverage:`, and `Findings:` lines. A failure looks like any remaining "When the invocation names a plan" text, or a scoped review that still builds a promise list.
3. Read `ai/tasks/feature/build-a-complex-feature.md` Steps 6 and 8 and `ai/tasks/feature/build-a-feature.md` Step 8, and confirm each review call passes only the PR number plus, in Steps 6.1 and 6.5, a `scope:` argument. Confirm Step 6 has no description-only shortcut, its items are numbered 1 to 6 with every internal "skip to item" and "repeat items" reference pointing at the right item, Step 6.2 still records the PR head SHA, and the line-22 orchestration rule names only the Step 8 full review. A failure looks like any remaining "Override its Step 2 and Step 3 review scope", a plan path handed to the review, Step 6.2 still calling the record "the only place the resolution review can find what was promised", or Step 7 still saying "unless their last findings were all description-only".
4. Read `product/specs/pull-request-review.md` and confirm it no longer says a resolution review "checks each resolved finding against what its entry proposed" and that it describes the three scopes and the fallback.
