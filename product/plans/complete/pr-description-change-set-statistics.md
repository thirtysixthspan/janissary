# Keep change-set statistics out of pull request descriptions

**Complexity: 2/10** — one short guideline paragraph added to each playbook that writes a pull request description, one sentence in the review playbook, two spec sentences, and a new pin test. No runtime surface.

## Goal

Playbooks under `ai/tasks/` that create or update a pull request description sometimes fill it with numbers a reader can already see on GitHub: how many commits, files, or lines changed, and which commit SHAs the branch holds. Those claims add nothing, and they go stale with the next push, which then turns into review findings and description corrections.

Add a guideline, not a hard rule, to every playbook that writes a description: leave out commit, file, and line counts, commit SHAs, and anything else a reader can read straight off the change set, and describe what changed and why instead.

## Decisions

- The guideline is a soft rule. Each playbook states it as a guideline, so an agent can still keep a figure that carries information the change set doesn't.
- Every playbook that writes description text carries the guideline itself. These tasks run in fresh subagents that read only their own file, so a shared note elsewhere would not reach them. The playbooks that write description text are `workspace/open-feature-pull-request.md`, `workspace/merge-change-to-master.md`, `feature/update-pull-request.md`, `feature/work-pull-request-issue.md`, `feature/test-pull-request.md`, and `hygiene/update-package-outside-range.md`. The others (`fix-a-bug.md`, `remove-an-existing-feature.md`, `build-a-feature.md`, `build-a-complex-feature.md`, `resolve-technical-debt.md`) hand description writing to one of these and inherit it.
- Two existing SHAs stay, and the guideline names them as exceptions. `open-feature-pull-request.md` links screenshots by a commit SHA so the images still resolve after the branch is deleted, which is a link and not a claim. `test-pull-request.md` names the commit its additional test cases were written against, which records what was tested and can't be read off the change set.
- No playbook writes a **Files changed** section. GitHub already lists the changed files. `update-package-outside-range.md` no longer writes one, and `update-pull-request.md` no longer rebuilds one. Neither playbook is told to remove a section an existing description already has. `open-feature-pull-request.md` already writes none, so `update-pull-request.md`'s list of the sections that task writes is corrected to **What**, **Behavior examples**, **Screenshots**, and **How to verify**.
- Test counts in the package-upgrade Verification section stay. They come from test runs, not from the change set.
- `feature/review-pull-request.md` writes no description, but its description-fidelity findings drive corrections. When a stated statistic is wrong, the proposal removes it instead of correcting the number, and a correct statistic is not a finding on its own.

## Implementation steps

1. `ai/tasks/workspace/open-feature-pull-request.md`, `## The PR description`: add the guideline paragraph, naming the screenshot-link exception.
2. `ai/tasks/workspace/merge-change-to-master.md`, Step 4: add the guideline paragraph after the What/Why sentence.
3. `ai/tasks/feature/update-pull-request.md`, Step 8 item 2: correct the list of sections `open-feature-pull-request.md` writes, drop the **Files changed** rebuild, and add a bullet applying the guideline to corrections and additions, removing a stated statistic rather than updating it.
4. `ai/tasks/feature/work-pull-request-issue.md`, Step 8 sub-step 5: apply the guideline to the corrected paragraphs.
5. `ai/tasks/feature/test-pull-request.md`, Step 11 item 2: name the tested-commit line as the section's only SHA and apply the guideline to the rest.
6. `ai/tasks/hygiene/update-package-outside-range.md`, Step 11: add the guideline paragraph after the body-structure paragraph and delete the **Files changed** section.
7. `ai/tasks/feature/review-pull-request.md`, the description-fidelity dimension: route a wrong statistic to removal and state that a correct one is not a finding by itself.
8. `product/specs/pull-request-updating.md`, `### What an update changes`: the file list is no longer rebuilt, and stated figures are removed rather than updated. `product/specs/pull-request-review.md`, `### Review and recording`: one sentence on wrong statistics. `documentation/user-documentation/workflows/updating-a-pull-request.md`: the description bullet no longer mentions rebuilding a file list.
9. `scripts/pr-description-statistics-guideline.test.mjs`: a new pin test (see Tests).

## Tests

`scripts/pr-description-statistics-guideline.test.mjs`, a new file in the style of `scripts/build-a-complex-feature-review-cycle.test.mjs`. It pins only the wording the guideline depends on:

- Each of the six description-writing playbooks states the guideline and marks it as a guideline rather than a hard rule.
- `open-feature-pull-request.md` keeps its screenshot-link exception, and `test-pull-request.md` keeps its tested-commit exception.
- `update-pull-request.md` and `review-pull-request.md` remove a wrong statistic instead of correcting the number.
- No playbook under `ai/tasks/` asks for a **Files changed** section.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`, plus a direct run of the `scripts/*playbook*`, `scripts/build-a-*`, and new pin tests, since `check-diff` does not pick up pin tests for edited markdown.

Manual: read each edited section and confirm the guideline reads as advice, not a block, and that no playbook still asks for a count or SHA in the description apart from the two named exceptions.

## Out of scope

- Enforcing the guideline in `scripts/pr-create-pr.sh` or any other script.
- Rewriting existing descriptions on open pull requests.
- Reports the playbooks print at the end of a run. They aren't pull request descriptions, so counts there stay.
- `help/`, and user documentation beyond the one update-workflow bullet that described the file-list rebuild.
