<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the pull request title's claim that this is only a plan-decomposition change, when the diff delivers the model search feature.

Existing Issue: The PR title reads "docs(plans): decompose model search input plan into ordered subplans" while the diff adds the shared model search input to the roles Add model picker and the New harness dialog, and only moves the plan from ready to complete. Severity: 5/10

Existing Risk: 5/10 - A squash merge records a docs-only subject for a feature, so release notes and future history searches misclassify the change and hide it from people looking for the feature.

Proposal Risk: 1/10 - The title would match the body and the diff, and no code behavior changes; the only residual risk is that a human might prefer a different conventional-commit scope for the subject.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2099 "correct the pull request title to describe the model search feature". Replace the PR title with a conventional-commit subject that describes the actual change, for example `feat(roles,harness): add shared model search input`, by running `gh pr edit 2099 --title ...`. Do not change the PR body — it already describes the final code accurately — and do not touch any source, test, spec, doc, or plan file. Verify with `gh pr view 2099 --json title,body` that the new title names the feature and uses a valid type from ai/guidelines/conventional-commits.md. This is a metadata-only change, so no build, lint, or test run is needed; leave the pull request open.
