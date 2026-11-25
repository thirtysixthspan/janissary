# Compare the resolution review's reported range head with the head SHA recorded before delegation

**Complexity: 2/10** — 8 behavioral requirements, ~1 rewritten playbook line in 1 task file, 3 test scenarios (p=4.09)

## Goal

`build-a-complex-feature.md` Step 6 item 4 delegates the resolution review with `scope: range <recorded head SHA>..<current PR head SHA>` but records only the base. Once the review finishes, it requires the reported `<head>` to be a prefix of "the current PR head SHA". A review that records findings commits and pushes its backlog, so by then the PR head is the review's own commit and the comparison fails exactly when there is work to do. This plan has the orchestrator record the PR head SHA immediately before delegating, pass that value as the range head, and compare the reported `<head>` with it, so a correctly scoped resolution review that records findings is no longer treated as blocked.

## Requirements

1. Before delegating the resolution review, item 4 records the current PR head SHA as the range head, per the entry's proposal "before delegating the resolution review, have the orchestrator record the current PR head SHA as the range head".
2. Item 4 passes that recorded value as the range's head, per "keep the existing argument text and say the head is the value read immediately before delegation and recorded".
3. Item 4's `Scope:` confirmation requires `<head>` to be a prefix of the recorded range head SHA, per "reword the confirmation so `<head>` must be a prefix of that recorded range head SHA rather than of "the current PR head SHA"".
4. Nothing in item 4 compares the reported head with a PR head read after the review returns, per "confirming nothing in it compares against a head read after the review returns".
5. `scripts/review-pull-request-scope.test.mjs` asserts the new prefix clause in place of the old one, per "update ... the prefix clause asserted by the `blocks a focused or resolution review that did not run in its requested scope` test ... to the new wording".
6. The same test asserts that the head is compared with the recorded value, per "add an assertion that the head is compared with the recorded value".
7. The pull request description's sentence saying item 4 accepts range ends that are prefixes of "the current PR head SHA" is corrected to name the recorded range head, per "Update the pull request description's "The callers change to match." paragraph ... where they say item 4 accepts range ends that are prefixes of "the current PR head SHA"".
8. Every pull request description line anchor this change shifts is re-derived from the branch head, per "re-derive any line anchors the edit shifts".

## Design decisions

- The `scope: range <recorded head SHA>..<current PR head SHA>` argument text stays as it is, and item 4 says that the current PR head SHA it passes is the value it just recorded. This is the proposal's second option, and it leaves the test literal for the argument and every description sentence quoting it correct (Assumption 2).
- The recorded value is named "the recorded range head SHA", distinct from item 2's "recorded head SHA", which is the range's base (Assumption 3).
- Item 4 stays one line, so the description's anchors into `build-a-complex-feature.md` (lines 83, 86, and 83-88) stay valid (Assumption 1).
- Item 5 is unchanged. It repeats items 2 through 4, so each pass records a fresh range head through item 4 itself (Assumption 4).
- The spec's sentence saying a shortened identifier matches "the identifier the workflow passed" already describes comparing with the value passed, so `product/specs/pull-request-review.md` is checked and left unchanged (Assumption 5).
- The test gains two assertion lines, so later `it` lines in `scripts/review-pull-request-scope.test.mjs` move down by two, and the description's anchors to them (lines 56, 65, 79, 89, and the span 27-91) are re-derived (Assumption 6).

## Preserved behavior

1. The complex-feature workflow passes scopes as literal arguments. Negative assertion: the edit must not change the `scope: range <recorded head SHA>..<current PR head SHA>` or `scope: commit <implementation commit SHA>` argument text, and must not reintroduce "Override its Step 2 and Step 3 review scope". Test: `scripts/review-pull-request-scope.test.mjs` "is passed by the complex-feature workflow instead of override prose".
2. A mis-scoped resolution review blocks the workflow. Negative assertion: the edit must not drop item 4's "confirm its `Scope:` line reads `range <base>..<head>`" phrase, the base prefix rule against the recorded head SHA, or "Handle any other value as item 1 does.". Test: `scripts/review-pull-request-scope.test.mjs` "blocks a focused or resolution review that did not run in its requested scope".
3. Step 6 has no description-only shortcut. Negative assertion: the edit must not add "If every recorded entry was description-only" to `build-a-complex-feature.md`. Test: `scripts/review-pull-request-scope.test.mjs` "leaves no description-only shortcut in the focused review cycle".

## Assumptions

1. Item 4 is a single line, at `ai/tasks/feature/build-a-complex-feature.md:86` "4. Once the backlog is empty, delegate".
2. The test pins the range argument literally, at `scripts/review-pull-request-scope.test.mjs:42` "`scope: range <recorded head SHA>..<current PR head SHA>`".
3. Item 2 records the range's base, at `ai/tasks/feature/build-a-complex-feature.md:84` "record the PR head SHA before any repair starts. It is the base of the resolution review's range."
4. Item 5 repeats item 4, at `ai/tasks/feature/build-a-complex-feature.md:87` "repeat items 2 through 4 with the new entries and a new recorded head SHA".
5. The spec compares with the value the workflow passed, at `product/specs/pull-request-review.md:33` "a shortened one matches when it is the start of the identifier the workflow passed".
6. The description cites test lines by number, including `scripts/review-pull-request-scope.test.mjs:56` "checks scope SHAs as hexadecimal before any git command receives them" and `scripts/review-pull-request-scope.test.mjs:89` "leaves no description-only shortcut in the focused review cycle".

## Existing functionality

1. The prefix clause the confirmation already uses, at `ai/tasks/feature/build-a-complex-feature.md:86` "with that `<base>` a prefix of the recorded head SHA and that `<head>` a prefix of the current PR head SHA".
2. The test pinning both `Scope:` checks, at `scripts/review-pull-request-scope.test.mjs:46` "blocks a focused or resolution review that did not run in its requested scope".
3. The task's description-correction step, at `ai/tasks/feature/work-pull-request-issue.md` Step 8 item 5 "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

Steps 1 and 2 land as one checkpoint and one commit; step 3 runs after the push. The build command after each step is `$janissary/scripts/run.mjs check-diff`.

1. In `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 4, have the orchestrator read the current PR head SHA and record it as the range head SHA before delegating, say the `<current PR head SHA>` in the unchanged `scope: range` argument is that recorded range head SHA, and change the prefix clause so `<head>` must be a prefix of the recorded range head SHA, not of a PR head read after the review. Keep the `<base>` rule, the `range <base>..<head>` phrase, "Preserve the same review-task rules as item 1.", "Handle any other value as item 1 does.", and the item numbering unchanged.
2. In `scripts/review-pull-request-scope.test.mjs`, change the prefix clause asserted by the `blocks a focused or resolution review that did not run in its requested scope` test to the new wording, and add assertions that item 4 records the range head before delegating and no longer contains "a prefix of the current PR head SHA". Leave every other assertion as it is.
3. After the push, correct the pull request description. In "The callers change to match." paragraph, change the clause saying item 4 accepts range ends that are prefixes of "the recorded head SHA and the current PR head SHA" to name the range head recorded before delegation. Re-derive the description's anchors into `scripts/review-pull-request-scope.test.mjs` with `grep -n` at the branch head and correct the ones that moved. Leave every other paragraph and the title unchanged.

## UI design

None. The change edits an agent playbook and a script test and adds no user interface.

## Tests

The plan changes no application behavior and adds no application code. In `scripts/review-pull-request-scope.test.mjs`, the `blocks a focused or resolution review that did not run in its requested scope` test asserts the new prefix clause (Requirements 3 and 5), that item 4 records the range head before delegating (Requirements 1, 2, and 6), and that the old "a prefix of the current PR head SHA" clause is gone (Requirement 4). Requirements 7 and 8 concern the pull request description and are checked by reading in Verification.

## Out of scope

- `ai/tasks/feature/review-pull-request.md` and its report template are unchanged.
- Step 6 items 1, 2, 3, 5, and 6 and the blocked paragraph after the list are unchanged.
- `product/specs/pull-request-review.md` is unchanged, because it already compares with the identifier the workflow passed.
- The description changes only in the item 4 prefix clause and in shifted line anchors.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff` and confirm `scripts/review-pull-request-scope.test.mjs` passes, including the new assertions.
2. Read `ai/tasks/feature/build-a-complex-feature.md` Step 6 item 4 end to end. Confirm it records the range head SHA before delegating, passes `scope: range <recorded head SHA>..<current PR head SHA>` with that recorded value as the head, and compares the reported `<head>` with the recorded range head SHA. A failure looks like any comparison against a PR head read after the review returns.
3. Run `gh pr view 2207 --json body` and confirm the item 4 clause names the recorded range head, and that each `scripts/review-pull-request-scope.test.mjs` line it cites matches `grep -n` at the branch head.
