# Describe the review-scope repairs' safeguards in the pull request description

**Complexity: 1/10** — no production code or files edited, 13 requirements, 0 test scenarios (p=3.44)

## Goal

Pull request 2207's description stops at the scope argument and its callers. It never says that the complex-feature workflow now checks each focused and resolution review's `Scope:` report line and blocks on any other value, that Step 5 reads the implementation commit SHA after the push, or that the review checks every SHA as hexadecimal by reading it and single-quotes every SHA it puts in a command. Its sentence on the new test also names only three of the behaviors that test pins. This fix adds those safeguards to the paragraphs the backlog entry names, each with a line anchor at the current branch head, and adds a How to verify edge case for the `Scope:` check. A reviewer approving from the description then sees that a mis-scoped review halts the build and sees the security control on the new argument.

## Requirements

1. The "What" paragraph about callers states that Step 6 items 1 and 4 of `ai/tasks/feature/build-a-complex-feature.md` read the review's Step 7 report before the backlog, from the entry: "add sentences stating that Step 6 items 1 and 4 of `ai/tasks/feature/build-a-complex-feature.md` read the review's Step 7 report before the backlog".
2. That paragraph states that the items confirm the `Scope:` line names the scope they passed, with a short commit SHA matching as a prefix, from the entry: "confirm its `Scope:` line names the scope they passed, a short commit SHA matching as a prefix".
3. That paragraph states that any other value, including `aggregate — requested "<value>" ignored`, blocks the workflow with no entries worked, anchored to the items' lines, from the entry: "any other value, including `aggregate — requested \"<value>\" ignored`, blocks the workflow with no entries worked, anchored to those items' lines".
4. That paragraph states that Step 5 reads the implementation commit SHA with `git rev-parse HEAD` once the push succeeds, anchored to its line, from the entry: "Step 5 reads the implementation commit SHA with `git rev-parse HEAD` once the push succeeds, anchored to its line".
5. The paragraph about the review's checks states that check 4 rejects any value that is not 4 to 40 lowercase hexadecimal characters by reading it, never placing it in a command, anchored to check 4, from the entry: "add that check 4 rejects any value that is not 4 to 40 lowercase hexadecimal characters by reading it, never placing it in a command".
6. That paragraph states that every SHA placed in a command is single-quoted, anchored to the quoting paragraph after the list, from the entry: "every SHA placed in a command is single-quoted, anchored to Step 1 item 5's check 4 and the quoting paragraph after the list".
7. That paragraph states the range-base check, anchored to check 8, from the entry: "also add the range-base check, anchored to check 8".
8. The sentence about `scripts/review-pull-request-scope.test.mjs` names the `Scope:` check, the hexadecimal check, the range-base check, and the unknown-keyword gate, anchored to their `it` lines, from the entry: "Extend the sentence about `scripts/review-pull-request-scope.test.mjs` to name the `Scope:` check, the hexadecimal check, the range-base check, and the unknown-keyword gate, anchored to their `it` lines".
9. How to verify gains an edge-case step for the `Scope:` check whose Do reads Step 6 items 1 and 4, from the entry: "Add a How to verify edge-case step for the `Scope:` check, with a Do that reads Step 6 items 1 and 4".
10. That step's Expect quotes the blocking sentence and names the `blocks a focused or resolution review that did not run in its requested scope` test as its assertion, from the entry: "an Expect that quotes the blocking sentence and names the `blocks a focused or resolution review that did not run in its requested scope` test as its assertion".
11. The added text cites no change-set statistics or commit SHAs, from the entry: "Cite no change-set statistics or commit SHAs".
12. No other paragraph and not the title changes, from the entry: "change no other paragraph or the title".
13. A diff of the old and new bodies shows only those additions, from the entry: "diff old and new bodies to confirm only those additions landed".

## Design decisions

- The new sentences are inserted into the named paragraphs, never rewriting an existing sentence, so the before-and-after diff shows only added text and every existing anchor keeps its target (assumption 9).
- The prefix rule is attributed to item 1 only. Item 4 confirms the range by naming the recorded and current head SHAs, and the description says so in those terms rather than claiming a prefix match item 4 doesn't make (assumptions 2 and 3).
- The callers' sentences go after the sentence naming item 4's argument, so the confirmation follows the arguments it checks. The Step 5 sentence comes next, since it explains where item 1's SHA comes from (assumptions 1 to 3).
- The hexadecimal, quoting, and range-base sentences go at the end of the "The review now reads a `scope:` argument" paragraph, after the sentence on the Allowed list, so they read as part of how the checks run (assumptions 4 to 6).
- The test sentence is extended in place by appending the four behaviors after its existing three, each with its `it` line (assumption 7).
- The new edge case is numbered 9, after step 8 under Edge cases, so the existing step numbers stay put (assumption 8).
- The added prose avoids em dashes, per `ai/guidelines/human-writing-guidelines.md`. The only dash is inside the quoted literal `aggregate — requested "<value>" ignored`.

## Preserved behavior

None found

## Assumptions

1. Step 5's SHA re-read sits at `ai/tasks/feature/build-a-complex-feature.md:75` "Once the push succeeds, read the implementation commit SHA with `git rev-parse HEAD`".
2. Step 6 item 1's confirmation sits at `ai/tasks/feature/build-a-complex-feature.md:83` "confirm its `Scope:` line reads `commit <short-sha>`, with that short SHA a prefix of the implementation commit SHA. Any other value, including `aggregate — requested \"<value>\" ignored`, means the review did not run in the scope it was given".
3. Step 6 item 4's confirmation sits at `ai/tasks/feature/build-a-complex-feature.md:86` "confirm its `Scope:` line reads `range <base>..<head>`, naming the recorded head SHA as its base and the current PR head SHA as its head. Handle any other value as item 1 does."
4. Check 4 sits at `ai/tasks/feature/review-pull-request.md:65` "is not 4 to 40 lowercase hexadecimal characters" and "A value that fails this check is never placed in any command".
5. Check 8 sits at `ai/tasks/feature/review-pull-request.md:69` "For `range`: the base is not in `origin/master..HEAD`, checked the same way, and is not the merge base".
6. The quoting paragraph sits at `ai/tasks/feature/review-pull-request.md:72` "Every SHA placed in a command, in these checks and in Step 3, is wrapped in single quotes".
7. The four tests open at `scripts/review-pull-request-scope.test.mjs:46` "it('blocks a focused or resolution review that did not run in its requested scope'", line 55 "it('checks scope SHAs as hexadecimal before any git command receives them'", line 64 "it('requires a range base on the pull request or at its merge base'", and line 78 "it('validates every requested scope other than aggregate, including an unknown keyword'".
8. How to verify's Edge cases end at step 8, "Every safeguard survives in every scope", followed by top-level step 4, as `gh pr view 2207 --json body` shows.
9. Every existing anchor in the body points into a file, not into the description, so adding text to the description moves none of them, as `gh pr view 2207 --json body` shows.

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entry byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body`, save a copy, and add:
   1. In "The callers change to match." paragraph, after the sentence ending "(line 86).", sentences saying that both items read the review's Step 7 report before the backlog and confirm its `Scope:` line names the scope they passed, that item 1 accepts a short SHA that is a prefix of the implementation commit SHA, and that any other value, including `aggregate — requested "<value>" ignored`, blocks the workflow with none of its entries worked (lines 83 and 86). Then a sentence saying Step 5 reads the implementation commit SHA with `git rev-parse HEAD` once the push succeeds, so a retried push can't hand item 1 a stale SHA (line 75).
   2. At the end of "The review now reads a `scope:` argument" paragraph, sentences saying a range base must also lie on the pull request or be its merge base (check 8, line 69), that check 4 judges each SHA as 4 to 40 lowercase hexadecimal characters by reading it and never places a failing value in a command (line 65), and that every SHA the review does place in a command is single-quoted (line 72).
   3. In the sentence on `scripts/review-pull-request-scope.test.mjs`, after "passes scopes, not override prose", the `Scope:` check (line 46), the hexadecimal check (line 55), the range-base check (line 64), and the unknown-keyword gate (line 78).
   4. Under Edge cases, a step 9, "A mis-scoped review blocks the complex-feature build", whose Do reads Step 6 items 1 and 4 of `ai/tasks/feature/build-a-complex-feature.md` (lines 83 and 86) and whose Expect quotes "Any other value, including `aggregate — requested \"<value>\" ignored`, means the review did not run in the scope it was given" and names the `blocks a focused or resolution review that did not run in its requested scope` test at `scripts/review-pull-request-scope.test.mjs:46` as its assertion.
4. Write the full revised body to `./temp/pr-body.md`, apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`, then diff the saved and live bodies.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced.

## Out of scope

- Every playbook, spec, script, and test file. The entry corrects only the description, and `product/specs/pull-request-review.md` already describes the `Scope:` confirmation, the SHA re-read, and the non-identifier fallback.
- The title and every existing sentence of the description, including its existing anchors.
- The abbreviated range ends in Step 6 item 4. The other backlog entry covers them.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and diff it against the saved body: every changed line should only add text, in the three named paragraphs and the new step 9, and a removed or reworded existing sentence means the correction overreached. Read each new anchor at the branch head. Line 75 of `ai/tasks/feature/build-a-complex-feature.md` should hold the `git rev-parse HEAD` sentence, and lines 83 and 86 Step 6 items 1 and 4 with their `Scope:` confirmations. Lines 65, 69, and 72 of `ai/tasks/feature/review-pull-request.md` should hold check 4, check 8, and the single-quote paragraph. Lines 46, 55, 64, and 78 of `scripts/review-pull-request-scope.test.mjs` should open the four named tests. A different line at any of those anchors shows the description cites the wrong text.
