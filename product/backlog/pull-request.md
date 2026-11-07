<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Fold the completed implementation subplans into the canonical feature plan and remove the stale subplan reference.

Existing Issue: Nine completed implementation subplans remain beside the canonical plan despite the one-plan-per-pull-request rule, the pull request description says they remain, and subplan 09 refers to the deleted `quit-walk-gone-tab-title-test.md` plan. Severity: 4/10

Existing Risk: 4/10 - Duplicate completed plans can drift from the canonical record and the dead dependency can send future maintainers looking for a plan that no longer exists.

Proposal Risk: 1/10 - The canonical plan becomes the sole completed feature plan with no dangling subplan reference, while the delivered implementation and its review remain unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "fold completed subplans into the canonical feature plan". Treat `product/plans/complete/quitting-with-unsaved-work.md` as the sole canonical plan; fold any still-needed decisions, final outcomes, and verification context from `product/plans/complete/01-move-unsaved-work-modules.md` through `09-specs-docs-and-verification.md` into it, then remove those nine completed subplan files. Ensure the deleted `quit-walk-gone-tab-title-test.md` reference from subplan 09 is not copied into the canonical plan, and update the pull request description's claims that the implementation subplans remain so it identifies the canonical plan accurately. Preserve the canonical plan's title, structure, and original complexity rating. Verify that the canonical plan covers the delivered feature, no completed implementation subplans or reference to the removed fix plan remain, and the one-plan rule in `product/specs/pull-request-updating.md` is satisfied.
