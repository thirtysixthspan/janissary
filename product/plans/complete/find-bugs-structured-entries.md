# File spec-testing bugs in the structured backlog entry format

**Complexity: 3/10** — two playbooks, one spec paragraph, and one test file. No application code.

`ai/tasks/research/find-bugs.md` files each bug as one lowercase prose paragraph that carries the spec quote, the reproduction, expected versus observed, the root cause, and the likely fix in a single run of text. The entries it has produced run to four hundred words with no internal structure, so a reader scanning `## development` to decide what to promote has to read each one end to end to learn what is broken and how badly. `ai/tasks/research/find-technical-debt.md` solved the same problem for the debt backlog with a five-part entry: a glanceable `*` summary bullet, a one-sentence statement of what exists today with a severity score, two risk scores that make the case for the work, and one long `Proposal` paragraph written for an agent that opens the entry cold. `ai/tasks/pull-request-review.md` already copies that format with deliberate differences. Bugs should follow it too.

## Approach

**Copy the five-part format, differing on purpose in two places.** Each new bug is a `*` summary bullet followed by `Existing Bug`, `Existing Risk`, `Proposal Risk`, and `Proposal` paragraphs, flush left, one blank line between parts and two between entries. The first labeled paragraph is `Existing Bug` rather than `Existing Debt`, and the severity scale is reworded for a runtime divergence from a spec. The risk scale is copied verbatim.

**The evidence moves into the `Proposal` paragraph.** The existing rule's required contents (quoted spec promise, reproduction through the browser or tool, expected versus observed, root cause with file and function names, likely fix) all stay required. They become the `Proposal` paragraph, in that order, followed by the tests that should pin the fix. The `Existing Bug` sentence states the divergence in one line. Files are named by path and function, never by line number, the same rule the debt format uses, because a bug may sit in `## development` for a while before anyone takes it.

**Dedupe and evidence appends learn the new shape.** Existing entries are identified by their lead `*` bullet, whichever shape they have. A `re-observed on <YYYY-MM-DD>:` sentence goes at the end of the entry's last paragraph: its `Proposal` for a structured entry, its only paragraph for an older one. Older paragraph entries are never migrated.

**`fix-a-bug.md` removes the whole entry.** Its Step 8 and its fifth forbidden rule say to remove "the line" for the fixed bug. With a five-part entry that would leave four orphaned paragraphs under `## ready`. The two sentences change to remove the entry from its `*` bullet through its last paragraph, which covers both shapes. Its Step 1 learns that a structured entry's summary bullet is the bug text for reporting and its `Proposal` is the report to verify, not a substitute for replication. This is the one consumer the format change would otherwise break.

**The copied risk scale is pinned.** `scripts/find-bugs-playbook.test.mjs` gains an assertion that the risk-scale table in `find-bugs.md` is byte-identical to the one in `find-technical-debt.md`, since the playbook states the table is copied and nothing else would catch the two drifting. A second assertion checks that the entry template names the five parts in order.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` Step 7: replace the "one lowercase prose bullet" paragraph with the five-part template, the parts, the two scales, and a worked example. Update the dedupe and evidence-append paragraphs for the entry shape. Keep the `## development` insertion, section-order, and `## declined` rules unchanged. Step 7 stays within the ten-change cap wording.
2. `ai/tasks/fix-a-bug.md`: Step 1 note on structured entries, Step 8 and forbidden rule 5 remove the whole entry.
3. `scripts/find-bugs-playbook.test.mjs`: the risk-scale pin and the template-order pin.
4. `product/specs/task-picker.md` "Finding bugs from specs": describe the new entry shape.

## Tests

- `scripts/find-bugs-playbook.test.mjs`: the risk-scale table extracted from `find-bugs.md` equals the one extracted from `find-technical-debt.md`.
- The same file: the playbook's entry template carries `Existing Bug:`, `Existing Risk:`, `Proposal Risk:`, and `Proposal:` in that order after a `*` bullet.
- The existing report-shape pin keeps passing, since the report lines do not change.

## Out of scope

- **Migrating existing bug entries.** The four `## ready` bugs and the two deferred ones stay as written, the same as older debt entries.
- **The report shape.** `New bugs: <count> under ## development — <one line each>` already fits a summary bullet, and the shape is pinned against `find-bugs-task.md`.
- **Editing `find-technical-debt.md` or `pull-request-review.md`.** Their "belongs in both" notes describe their own pair. The new test is what keeps the third copy in step.
- **Other backlog consumers.** `work-an-issue.md` reads `issues.md` and `pull-request.md`, never `bugs.md`.

## Verification

Automated: `./scripts/run.mjs check-diff`, which runs the playbook test with the server tests.
