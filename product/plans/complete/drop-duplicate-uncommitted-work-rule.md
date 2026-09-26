# Drop the duplicated uncommitted-work rule from the recovery section

**Complexity: 1/10** — one bullet out of a list. No code, no test, no spec change.

`ai/tasks/research/find-bugs.md` states the same rule twice. The recovery section ends with a bullet saying uncommitted work already in the tree is not the run's to remove, that Step 9 is where that is enforced, and that an unattributable change must be preserved and reported rather than discarded. Step 9 then says it at the point where it operates, and says it more concretely: restore what this run can account for, and treat an unfamiliar change as someone's work — do not discard it, do not stage it, stop shipping, preserve it, report the obstruction.

Comparing the two line by line, the recovery bullet adds nothing but the cross-reference to Step 9. Every commitment it makes is already made where the decision happens, so the second statement is the one doing the work and the first is a restatement a reader meets before reaching it. This removes the restatement.

What keeps the guarantee intact, unchanged:

- **Step 9**, which is where a change is actually judged, still forbids discarding an unattributable change and still stops shipping rather than sweeping it into a commit.
- **The recovery bullet above it**, which says the run does not restore, switch, reset, or clean the tree it was handed — a different rule, about what the run does to the tree rather than about what it commits.
- **Forbidden item 5**, which forbids discarding someone else's changes on the way to the branch under test.
- **The spec**, which describes the commit-time behavior and is unaffected: it says the run stops rather than shipping or discarding, which is Step 9's rule and remains true.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — the last bullet of "Recovery on every stop".

## Tests

None, and none needed. `scripts/find-bugs-playbook.test.mjs` pins application literals, the report shape, the two delegations, and the loopback address; none of them is in the removed text, so the suite is expected to pass untouched and is the check that nothing else went with it.

## Out of scope

- **Step 9's wording.** It is the operative statement and stays as it is.
- **The neighbouring bullet** about leaving the working tree as found, which is a rule about the tree rather than about the commit.
- **The spec.** Its sentence describes Step 9, which has not changed.
- **Any conclusion about what a run should do with uncommitted work.** This removes a duplicate statement of a rule that remains in force; it does not relax it.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task for `discard` and confirm every remaining mention is Step 9 forbidding it rather than a second copy of that prohibition.
