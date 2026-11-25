# Anchor the review-scope pull request's behavior examples and edge-case steps to the task text

**Complexity: 1/10** — no production code or files edited, 11 requirements, 0 test scenarios (p=3.33)

## Goal

Pull request 2207's description backs almost every claim with a line anchor, but three spots don't. The Before/After transcript and the fallback sentence under "Behavior examples" cite nothing, and How to verify step 6 points at a section name rather than a line. How to verify step 5 has a second problem: four repairs since the review added checks to Step 1 item 5 of `ai/tasks/feature/review-pull-request.md`, so its "seven ordered checks" now undercounts the nine on the branch. This fix anchors each of those claims to the branch text that proves it, and corrects step 5's count and list. A reader can then check each claim without searching the playbooks.

## Requirements

1. The Before block under "Behavior examples" is anchored to master's Step 6 item 1 in `ai/tasks/feature/build-a-complex-feature.md`, from the entry: "anchor it to master's version of Step 6 item 1 in ai/tasks/feature/build-a-complex-feature.md rather than to a branch line".
2. The After invocation is anchored to the review's `Invocation:` paragraph, from the entry: "anchor the After invocation to the `Invocation:` paragraph near the top of ai/tasks/feature/review-pull-request.md".
3. The After invocation is also anchored to the branch's Step 6 item 1, from the entry: "and to Step 6 item 1 of ai/tasks/feature/build-a-complex-feature.md".
4. The fallback sentence is anchored to Step 1 item 5 of the review task, from the entry: "anchor the fallback sentence ... to Step 1 item 5".
5. The fallback sentence is also anchored to the Step 7 `Scope:` template line, from the entry: "and the Step 7 `Scope:` template line of ai/tasks/feature/review-pull-request.md".
6. How to verify step 6 names the line of the "A scope whose diff holds no changes has nothing to review" sentence, from the entry: "replace \"read \\\"Confirm coverage\\\" in Step 3\" with the line of that paragraph's ... sentence at the branch head".
7. How to verify step 5 states the number of ordered checks Step 1 item 5 holds on the branch, from the delegating instruction: "How to verify step 5 still says \"seven ordered checks\". Those stale anchors and that count are part of the same description-fidelity concern".
8. How to verify step 5 lists every one of those checks in order.
9. Every anchor in the corrected paragraphs lands on the text it cites at the branch head, from the delegating instruction: "Verify every anchor in the paragraphs this entry names against the current branch text."
10. Every other paragraph of the body, and the title, stay exactly as they are, from Forbidden rule 9: "Correct only paragraphs the resolved work item names, preserving everything else exactly."
11. The corrected paragraphs cite no change-set statistics or commit SHAs, from Step 8 item 5: "don't cite commit SHAs".

## Design decisions

- Anchors go in prose, not in the transcript. The Before/After block is a code block whose lines quote playbook text, so one sentence after it carries the anchors, matching the "A commit-scoped review's report (`...`)" sentence that follows it.
- The Before anchor names master by branch, not by commit SHA: "line 83 of master's `ai/tasks/feature/build-a-complex-feature.md`". Step 8 item 5 forbids citing commit SHAs, and master's Step 6 item 1 is the text this pull request replaces (assumption 4).
- The fallback sentence keeps its wording and gains anchors for the first check (line 62), the opening sentence that makes every check fall back (line 61), the recorded ignored value (line 74), and the template form (line 314). These are assumptions 1 to 3.
- How to verify step 5 is in scope even though the backlog entry doesn't name it. The delegating instruction names its count as part of this concern, and the fallback sentence's new anchor is the same Step 1 item 5 that step 5 describes. Its "Each one says it falls back" becomes a claim about the item's opening sentence, because the individual checks don't say it (assumption 1).
- Stale anchors outside the named paragraphs stay as they are, because Forbidden rule 9 limits the correction to the paragraphs this work item names. The final report lists them for a later work item.

## Preserved behavior

None found

## Assumptions

1. Step 1 item 5 opens at line 61 with nine numbered checks at lines 62 to 70, and its opening sentence carries the fallback: `ai/tasks/feature/review-pull-request.md:61` "Each one falls back to `aggregate` scope rather than stopping the review".
2. The first check rejects an unknown keyword: `ai/tasks/feature/review-pull-request.md:62` "The keyword is not `commit`, `range`, or `aggregate`." The ignored value is recorded at `ai/tasks/feature/review-pull-request.md:74` "On a fallback, also record the raw value you ignored, for Step 7's report."
3. The Step 7 `Scope:` template ends with the fallback form: `ai/tasks/feature/review-pull-request.md:314` "aggregate — requested \"<value>\" ignored".
4. Master's Step 6 item 1 holds the Before text: master's `ai/tasks/feature/build-a-complex-feature.md:83` "Override its Step 2 and Step 3 review scope: read the improved subplan as the promise".
5. The branch's Step 6 item 1 carries the After invocation: `ai/tasks/feature/build-a-complex-feature.md:83` "execute ./ai/tasks/feature/review-pull-request.md 232 scope: commit 1a2b3c4".
6. The `Invocation:` paragraph carries the same example: `ai/tasks/feature/review-pull-request.md:7` "execute ./ai/tasks/feature/review-pull-request.md 232 scope: commit 1a2b3c4".
7. The empty-scope sentence sits in "Confirm coverage": `ai/tasks/feature/review-pull-request.md:154` "A scope whose diff holds no changes has nothing to review."

## Existing functionality

1. `gh pr edit --body-file` replaces the body from a file, as Step 8 item 5 of `ai/tasks/feature/work-pull-request-issue.md` prescribes: `ai/tasks/feature/work-pull-request-issue.md:151` "gh pr edit <reference> --body-file ./temp/pr-body.md".

## Implementation steps

1. Write this fix plan and remove the resolved entry from `product/backlog/pull-request.md`, restoring the master skeleton because it is the only entry. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit and push to `tasks/review-pull-request-scope`.
3. After the push, read the body with `gh pr view 2207 --json body` and change four places:
   1. Behavior examples: add one sentence after the transcript anchoring Before to line 83 of master's `ai/tasks/feature/build-a-complex-feature.md`, and After to `ai/tasks/feature/review-pull-request.md:7` and `ai/tasks/feature/build-a-complex-feature.md:83`.
   2. Behavior examples: extend the fallback sentence with anchors to `ai/tasks/feature/review-pull-request.md:61-62`, line 74, and line 314.
   3. How to verify step 5: anchor lines 61-70, say nine ordered checks, list all nine in order, and attribute the fallback to the opening sentence at line 61.
   4. How to verify step 6: replace "read \"Confirm coverage\" in Step 3" with line 154.
4. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit 2207 --body-file ./temp/pr-body.md`.

## UI design

None. The change is to a pull request description on GitHub.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. No test covers the pull request description, and tests of documentation are not introduced.

## Out of scope

- Every playbook, spec, script, and test file. The entry says "edit no playbook, spec, script, or test".
- The title and every other paragraph of the description.
- Stale anchors outside the named paragraphs, such as the "What" paragraph's lines 80, 112, and 120, How to verify step 3's lines 80 and 112-120, and the report sentence's line 310. Forbidden rule 9 keeps this correction to the named paragraphs.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run `gh pr view 2207 --json body` and read the four changed places against the branch. Line 7 and line 83 of `ai/tasks/feature/build-a-complex-feature.md` should both hold `scope: commit 1a2b3c4`. Line 83 of `git show origin/master:ai/tasks/feature/build-a-complex-feature.md` should hold the Before text. Lines 61, 62, 74, and 314 of `ai/tasks/feature/review-pull-request.md` should hold the fallback, the unknown-keyword check, the recorded value, and the fallback report form. Lines 62 to 70 should hold exactly the nine checks step 5 lists, in that order, and line 154 the empty-scope sentence. Diff the old and new bodies: any change outside the four places means the correction overreached.
