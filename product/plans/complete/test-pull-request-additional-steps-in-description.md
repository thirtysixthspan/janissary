# Test task caps its own cases at five and adds them to the pull request description

**Complexity: 3/10**: prose rules in one playbook, including a new step and the renumbering it causes, a spec update, and pin assertions. The care needed is in the description edit. It is the task's only write to GitHub, so it has to stay confined to one section, and a run repeated on the same pull request must replace that section rather than stack a second one.

## Goal

`ai/tasks/test-pull-request.md` runs the pull request's own manual steps, then writes edge-case steps of its own with no cap on their number. Those extra steps exist only in the run's report. A reviewer who opens the pull request can't see which extra cases were exercised, and can't rerun them by hand. An uncapped list also makes each run longer and noisier than one change warrants.

After this change, the run still tests every manual step the pull request carries. It then writes up to five additional use cases or edge cases for the changed behavior and runs them. And it adds their testing steps to the pull request description in a new section, so they sit next to **How to verify**.

## Approach

The work falls into four changes to the playbook.

1. **Step 6, cap.** The step writes at most five additional steps, covering use cases as well as edge cases. When the change warrants more, it keeps the five most likely to expose a defect in the changed behavior. The "no cap" sentence goes. The Step 4 generated steps (`G1`, …), which stand in for missing manual steps, are not counted against the five.
2. **New Step 11, description.** After the failures are recorded and before tear-down, the run reads the current body with `gh pr view <number> --json body`, and writes the full body with an `### Additional test cases` section to `./temp/test-pull-request/pr-body.md`. It then applies it with `gh pr edit <number> --body-file`. The section lists each Step 6 step as a numbered item with its concrete actions and expected result, and names the tested commit. It goes directly after **How to verify**, or at the end of the body when there is none. When the section already exists from an earlier run, it is replaced in place. Every other part of the body stays byte-for-byte, and the title is never touched. The body file lives under the scratch root, so the stop task removes it and `pr-commit` can never stage it. When Step 6 wrote no steps, the description is left alone. A failed edit is reported, not retried in a loop, and does not stop the run.
3. **Boundaries.** The intro, the Allowed list, and Forbidden rule 4 change from "never edits the description" to "edits the description only to write that one section". The section never carries the browser endpoint or the session token.
4. **Renumbering.** Tear-down, commit, confirm, and report become Steps 12–15, and every cross-reference follows. The report gains a `Description:` line.

## Implementation steps

1. `ai/tasks/test-pull-request.md`: rewrite the intro sentence, the Allowed list, and Forbidden rule 4. Cap Step 6 at five. Add Step 11. Renumber Steps 11–14 to 12–15 and fix the cross-references in Steps 2, 7, 9, 10, 12, and 14. Add the `Description:` line to the report.
2. `product/specs/pull-request-testing.md`: in **Edge cases**, replace "no cap" with the five-step limit and describe the description section. In **What a run never does**, narrow the description rule to that one section.
3. `scripts/test-pull-request-playbook.test.mjs`: pin the five-step cap, the body-file edit under the scratch root, and the rule that nothing outside the section and never the title changes.

## Tests

Assertions in `scripts/test-pull-request-playbook.test.mjs`:

- The playbook caps the additional steps at five and no longer says there is no cap.
- The description is written with `gh pr edit <number> --body-file ./temp/test-pull-request/pr-body.md`, never an inline `--body`.
- The playbook confines the edit to the `### Additional test cases` section and forbids touching the title.

## Out of scope

- Changing the Step 4 missing-steps finding. Generated `G` steps are still proposed for **How to verify** through `work-an-issue.md`.
- Adding step results to the description. The section carries testing steps; results stay in the report and the backlog.
- Changing `work-an-issue.md`, `auto-build.md`, or `open-feature-pull-request.md`.
