# Let the resolution review's Scope: check accept abbreviated range ends as prefixes

**Complexity: 2/10** — 6 behavioral requirements, ~1 rewritten playbook line in 1 task file, 2 test scenarios (p=3.80)

## Goal

`build-a-complex-feature.md` Step 6 item 1 accepts a short SHA in a focused review's `Scope:` line when it is a prefix of the implementation commit SHA. Item 4, the resolution review, requires its `Scope:` line to name the recorded head SHA and the current PR head SHA with no such allowance, while the review task's own range example abbreviates both ends. An orchestrator holding full SHAs could compare them literally against an abbreviated report, treat a correctly scoped resolution review as blocked, and halt the build with every repair already landed. This plan makes item 4 match each range end as a prefix, the same way item 1 matches its commit, so the only remaining block is a report that names a different commit.

## Requirements

1. Item 4's `Scope:` check accepts a `<base>` that is a prefix of the recorded head SHA, per the entry's proposal "with `<base>` a prefix of the recorded head SHA".
2. Item 4's `Scope:` check accepts a `<head>` that is a prefix of the current PR head SHA, per "`<head>` a prefix of the current PR head SHA".
3. Item 4's wording mirrors item 1's prefix wording, per "mirroring item 1's "with that short SHA a prefix of the implementation commit SHA" wording".
4. Item 4 still sends any other `Scope:` value to item 1's handling, per "keep "Handle any other value as item 1 does" ... unchanged".
5. The functional spec states that an abbreviated commit identifier in a review's report matches the one the workflow passed, per "Update the `Scope:` confirmation sentence in "Staged reviews for complex features" of `product/specs/pull-request-review.md` only if it needs to say that abbreviated SHAs match".
6. `scripts/review-pull-request-scope.test.mjs` asserts the new prefix wording for the range check, per "extend the `blocks a focused or resolution review that did not run in its requested scope` test to assert the new prefix wording for the range check".

## Design decisions

- The change rewrites only the confirmation sentence inside item 4, so Step 6's numbering and its "skip to item 6" and "repeat items 2 through 4" references stay valid (Assumption 3).
- The new clause follows item 1's "with that short SHA a prefix of the implementation commit SHA" shape (Assumption 1), so a reader sees one matching rule applied to both reviews.
- The spec gets one sentence after "the workflow confirms from the review's report that it ran in the scope it was given", because that sentence otherwise reads as an exact comparison, and the review's report prints abbreviated SHAs (Assumption 4). The spec states this once for both reviews rather than per item.
- The existing assertion `confirm its \`Scope:\` line reads \`range <base>..<head>\`` keeps passing unchanged, because the new wording keeps that phrase and appends the prefix clause after it.
- The review task is unchanged, because its report form and range example are what the caller must accept, not what needs fixing (Assumption 2).

## Preserved behavior

1. The complex-feature workflow passes scopes as literal arguments. Negative assertion: the edit must not change the `scope: range <recorded head SHA>..<current PR head SHA>` or `scope: commit <implementation commit SHA>` argument text, and must not reintroduce "Override its Step 2 and Step 3 review scope". Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
2. A mis-scoped focused or resolution review blocks the workflow. Negative assertion: the edit must not drop item 4's `range <base>..<head>` confirmation phrase, item 1's "Any other value, including `aggregate — requested "<value>" ignored`" sentence, or "work none of its entries". Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
3. A wrong change-set statistic is proposed for removal rather than correction. Negative assertion: no edit may change `ai/tasks/feature/review-pull-request.md`. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. Item 1 accepts a short SHA as a prefix, at `ai/tasks/feature/build-a-complex-feature.md:83` "with that short SHA a prefix of the implementation commit SHA".
2. The review's range example abbreviates both ends, at `ai/tasks/feature/review-pull-request.md:285` "`in range 1a2b3c4..5d6e7f8 of #232`".
3. Item 4 currently requires the full recorded and current head SHAs, at `ai/tasks/feature/build-a-complex-feature.md:86` "naming the recorded head SHA as its base and the current PR head SHA as its head".
4. The review's report names its scope with abbreviated forms, at `ai/tasks/feature/review-pull-request.md:314` "commit <short-sha> | range <base>..<head>".
5. The server test project collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'".

## Existing functionality

1. Item 1's prefix-matching rule, at `ai/tasks/feature/build-a-complex-feature.md:83` "confirm its `Scope:` line reads `commit <short-sha>`".
2. The test pinning both `Scope:` checks, at `scripts/review-pull-request-scope.test.mjs:46` "blocks a focused or resolution review that did not run in its requested scope".
3. The spec's scope-confirmation sentence, at `product/specs/pull-request-review.md:33` "the workflow confirms from the review's report that it ran in the scope it was given".

## Implementation steps

All three steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 4, replace "naming the recorded head SHA as its base and the current PR head SHA as its head" with a clause saying `<base>` is a prefix of the recorded head SHA and `<head>` is a prefix of the current PR head SHA, in item 1's "with that short SHA a prefix of" form. Keep `confirm its \`Scope:\` line reads \`range <base>..<head>\``, "Handle any other value as item 1 does.", the `scope: range` argument, and the item numbering unchanged.
2. In `scripts/review-pull-request-scope.test.mjs`, add one assertion to the `blocks a focused or resolution review that did not run in its requested scope` test that `build-a-complex-feature.md` contains the new prefix clause. Leave every existing assertion as it is.
3. In `product/specs/pull-request-review.md` "Staged reviews for complex features", add one sentence after "the workflow confirms from the review's report that it ran in the scope it was given" saying a report may shorten the commit identifiers it names, and a shortened one matches when it is the start of the identifier the workflow passed.

## UI design

None. The change edits an agent playbook and a spec and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. Per the entry's proposal, the `blocks a focused or resolution review that did not run in its requested scope` test in `scripts/review-pull-request-scope.test.mjs` gains one assertion for item 4's prefix clause (Requirements 1 to 3 and 6). Its existing assertions, including the one for item 4's `range <base>..<head>` phrase, keep passing (Preserved behavior 1 and 2, Requirement 4), and `scripts/pr-description-statistics-guideline.test.mjs` is unaffected (Preserved behavior 3). Requirement 5 is a spec sentence, checked by reading in Verification.

## Out of scope

- `ai/tasks/feature/review-pull-request.md`, its report template, and its range example are unchanged.
- Step 6 item 1, the item numbering, and the blocked paragraph after the list are unchanged.
- The PR description changes only in the sentence about item 1's short-SHA allowance, which now also covers item 4, and in line anchors into `scripts/review-pull-request-scope.test.mjs` that the new assertion shifts.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs`, including the new assertion, passes.
2. Read `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 4. Confirm it still passes `scope: range <recorded head SHA>..<current PR head SHA>`, confirms the `Scope:` line reads `range <base>..<head>`, accepts `<base>` as a prefix of the recorded head SHA and `<head>` as a prefix of the current PR head SHA, and ends with "Handle any other value as item 1 does." A failure looks like a full-SHA comparison left in place, a prefix rule on only one end, or a changed `scope:` argument.
3. Read `product/specs/pull-request-review.md` "Staged reviews for complex features" and confirm the new sentence says a shortened identifier in the report matches when it starts the one the workflow passed, and that the rest of the paragraph is unchanged.
