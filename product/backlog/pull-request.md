<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the pull request description to cover the no-code Verification accommodation added by the repair.

Existing Issue: The description frames this change purely as centralizing plan section lists and never mentions that the template's Verification requirement was redefined into running-app and reading-based forms or that a fix plan records that repair. Severity: 3/10

Existing Risk: 3/10 - A reviewer or future reader relying on the PR body treats this as a section-list cleanup and misses that verification obligations for documentation, spec, and configuration plans changed, so the relaxed rule ships under-described.

Proposal Risk: 1/10 - Only the PR description text changes; no guidance file or code behavior is touched, so the only residual risk is wording that still understates the change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2165 "mention the no-code Verification accommodation in the pull request description". The aggregate diff for #2165 rewrites the Verification section of ai/guidelines/plan-template.md to define the required manual check by plan surface (a running-app end-to-end check for behavior changes, a reading-based check naming files and consistency claims for no-code plans), states that check-diff alone is never sufficient, aligns the verification bullet in ai/tasks/planning/improve-plan.md, and adds the fix plan product/plans/complete/plan-template-verification-no-running-app.md. The PR body's "What" section describes only the section-list centralization and never mentions any of this. Add a short paragraph to the "What" section stating that the Verification requirement is redefined by plan surface, that check-diff is never sufficient on its own, and that the accommodation is recorded in the fix plan; leave the Behavior examples and How to verify steps otherwise intact. Do not change any file under ai/, product/, or src/. This review does not edit the description itself. Verify by reading the updated body beside the aggregate diff and confirming it now names both the two-form Verification rule and the fix plan.
