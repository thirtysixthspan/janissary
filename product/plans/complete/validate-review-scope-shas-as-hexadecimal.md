# Validate review scope SHAs as hexadecimal before any git command receives them

**Complexity: 3/10** — 10 behavioral requirements, ~3 added playbook lines in 1 task file, 4 test scenarios (p=4.46)

## Goal

The review task's new `scope:` argument hands its raw value straight to git. Step 0 item 4 records the value exactly as given, and Step 1 item 5 places it into `git rev-parse --verify <sha>^{commit}` and later Step 3 places it into `git diff`, with no format check in between. So shell metacharacters in the argument reach the shell of an agent that holds push access to the branch. This plan adds a format check that runs before any git command sees the value: the commit SHA, and each end of a range, must be 4 to 40 hexadecimal characters, and anything else falls back to aggregate scope without ever being placed in a command. It also states that each SHA placed in a command is quoted, and adds the new fallback case to the review spec.

## Requirements

1. Step 1 item 5 of the review task gains a check ahead of the `git rev-parse --verify` check, per the entry's proposal "add a check ahead of the `git rev-parse --verify` check".
2. The new check requires the commit SHA to consist only of 4 to 40 hexadecimal characters, per "the commit SHA, and each end of a range, must consist only of 4 to 40 hexadecimal characters".
3. The new check requires each end of a range to consist only of 4 to 40 hexadecimal characters, per the same sentence.
4. A value that fails the new check falls back to aggregate scope, per "any other value falls back to aggregate".
5. A value that fails the new check is recorded for Step 7's report, per "and is recorded for Step 7".
6. A value that fails the new check is never placed in a command, per "without ever being placed in a command".
7. The checks after the new one are renumbered, per "renumber the checks that follow".
8. Step 1 item 5 says each SHA placed in a command is quoted, per "In the same item, say that each SHA placed in a command is quoted".
9. The "Review and recording" section of `product/specs/pull-request-review.md` lists "a value that is not a commit identifier" among its fallback examples, per "Add "a value that is not a commit identifier" to the fallback examples".
10. `scripts/review-pull-request-scope.test.mjs` pins the new check's wording beside its existing assertions, per "Pin the new check's wording in scripts/review-pull-request-scope.test.mjs beside its existing assertions".

## Design decisions

- The new check sits between the malformed-range check and the `git rev-parse --verify` check, so it runs only once a commit SHA or both range ends have been parsed out, and before the first git command that would receive them (Assumption 2, Assumption 3).
- The allowed characters are lowercase hexadecimal, `0` to `9` and `a` to `f`. Every caller passes SHAs it read from git, which prints lowercase, so the narrower set costs nothing and leaves no case-folding question (Assumption 6).
- The length bounds are 4 and 40, matching git's shortest accepted abbreviation and a full SHA-1 object name, as the entry's proposal sets them (Assumption 3).
- The quoting rule is stated once in Step 1 item 5 and covers every later command that receives a SHA, including Step 3's diff commands, with `git rev-parse --verify '<sha>^{commit}'` as the example. Quoting also keeps `^{commit}` from being read as shell syntax (Assumption 4, Assumption 5).
- The recorded raw value stays only in the report. Step 7's `aggregate — requested "<value>" ignored` form already shows it, and that line is text, not a command (Assumption 7).
- Step 0 item 4 keeps recording the raw value exactly as given, because the report needs it and recording it runs nothing (Assumption 1).

## Preserved behavior

1. Every review safeguard stays in the review task in every scope. Negative assertion: the edit must not remove or reword the no-fix, no-tooling, clean-tree, dedupe, backlog-only commit, open pull request, or content-as-data rule text. Test: `scripts/review-pull-request-scope.test.mjs` "keeps the %s rule".
2. A bare invocation still reviews the full pull request. Negative assertion: the edit must not change "The scope is optional and defaults to `aggregate`, the full pull request". Test: `scripts/review-pull-request-scope.test.mjs` "reviews the full pull request when no scope is given".
3. The complex-feature workflow keeps confirming each review's `Scope:` line. Negative assertion: no edit may change `ai/tasks/feature/build-a-complex-feature.md`. Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
4. A wrong change-set statistic in a description is proposed for removal rather than correction. Negative assertion: the edit must not touch the review task's statistics wording. Test: `scripts/pr-description-statistics-guideline.test.mjs` "removes a stated statistic instead of correcting it".

## Assumptions

1. Step 0 records the raw scope value without resolving it, at `ai/tasks/feature/review-pull-request.md:49` "record the requested scope and its raw value exactly as given".
2. The malformed-range check precedes the resolution check, at `ai/tasks/feature/review-pull-request.md:64` "`range` does not give both a base and a head in the form `<base>..<head>`".
3. The first git command a SHA reaches is the resolution check, at `ai/tasks/feature/review-pull-request.md:65` "`git rev-parse --verify <sha>^{commit}` fails for the commit SHA or for either end of the range".
4. Step 3 places the SHAs into diff commands, at `ai/tasks/feature/review-pull-request.md:115` "`git diff <sha>^ <sha>`" and `ai/tasks/feature/review-pull-request.md:116` "`git diff <base>..<head>`".
5. Step 3's commands substitute the scope's diff, at `ai/tasks/feature/review-pull-request.md:118` "substitute the scope's diff for it in every command".
6. The complex-feature caller passes SHAs read from git, at `ai/tasks/feature/build-a-complex-feature.md:83` "`scope: commit <implementation commit SHA>`".
7. The report shows the ignored raw value, at `ai/tasks/feature/review-pull-request.md:310` "aggregate — requested \"<value>\" ignored".
8. The server test project collects script tests, at `vitest.config.ts:14` "'scripts/**/*.test.mjs'".

## Existing functionality

1. The ordered fallback list the new check joins, at `ai/tasks/feature/review-pull-request.md:61` "apply these checks in order and stop at the first that applies".
2. The fallback recording rule, at `ai/tasks/feature/review-pull-request.md:70` "On a fallback, also record the raw value you ignored, for Step 7's report."
3. The spec's fallback examples, at `product/specs/pull-request-review.md:5` "Examples are an unknown keyword, a missing commit, a commit that doesn't exist".
4. The playbook-wording assertions for the review task, at `scripts/review-pull-request-scope.test.mjs:26` "describe('the review-pull-request scope argument'".

## Implementation steps

All three steps land as one checkpoint and one commit. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/review-pull-request.md` Step 1 item 5, insert a new check 4 after the malformed-range check: the commit SHA, or either end of the range, is not 4 to 40 lowercase hexadecimal characters (`0` to `9` and `a` to `f`). Say that such a value is never placed in any command and is only recorded for Step 7. Renumber the old checks 4 to 7 as 5 to 8, keeping their wording and order. In the paragraph after the list, add that every SHA placed in a command, here and in Step 3, is wrapped in single quotes, for example `git rev-parse --verify '<sha>^{commit}'`. Leave Step 0 item 4, Step 3, and Step 7 unchanged.
2. In `product/specs/pull-request-review.md` "Review and recording", add "a value that is not a commit identifier" to the fallback examples after "a missing commit".
3. In `scripts/review-pull-request-scope.test.mjs`, add one `it` in the existing `describe` that reads the review task and asserts it contains the hexadecimal check, the never-placed-in-a-command rule, the quoting rule, and that the hexadecimal check comes before the `git rev-parse --verify` check.

## UI design

None. The change edits an agent playbook and a spec and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. `scripts/review-pull-request-scope.test.mjs` gains one assertion that the review task carries the 4-to-40 hexadecimal check, the rule that a failing value is never placed in a command, the quoting rule, and the check's position ahead of `git rev-parse --verify` (Requirements 1 to 8 and 10). Its existing assertions and `scripts/pr-description-statistics-guideline.test.mjs` keep passing (Preserved behavior 1 to 4). No test can exercise an agent refusing to run a command, so Verification checks the item by reading it.

## Out of scope

- The pull request target passed to `gh pr view` has the same unvalidated shape, but it predates this pull request and stays unchanged.
- Ref names such as branch names are not accepted as scope values. A caller passing one now falls back to aggregate, which the report's `Scope:` line shows.
- SHA-256 object names longer than 40 characters are not accepted.
- `ai/tasks/feature/build-a-complex-feature.md` and the pull request description are unchanged.
- The other backlog entries on this pull request are not touched.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs`, including the new assertion, and `scripts/pr-description-statistics-guideline.test.mjs` pass.
2. Read `ai/tasks/feature/review-pull-request.md` Step 1 item 5. Confirm it lists eight checks, that check 4 is the hexadecimal check and comes before the `git rev-parse --verify` check, that it says a failing value is never placed in a command, and that the paragraph after the list says every SHA in a command is single-quoted. A failure looks like the hex check placed after the resolution check, a check list still numbered 1 to 7 with a gap or duplicate, or a quoting rule that names only Step 1.
3. Read the "Review and recording" section of `product/specs/pull-request-review.md` and confirm "a value that is not a commit identifier" appears among the fallback examples.
